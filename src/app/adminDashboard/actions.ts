"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireAdmin, requireUser } from "@/server/helpers/currentUser";
import { logActivity } from "@/server/helpers/logActivity";
import { buildUserRolesFromJson, extractUserIdsFromJson } from "@/server/lib/roomRoles";
import { createCalendarEvent, deleteCalendarEvent, buildEventBody } from "@/server/lib/outlookCalendar";
import { emitGlobalEvent } from "@/server/lib/event-bus";

type CreateAuditState =
  | { ok: true }
  | { ok: false; error: string };

export type CreateAuditInput = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  status: string;
  timezone: string;
  frontRoomsCount: number;
  backRoomsCount: number;
  statusColumnsJson: string;
  roomRolesJson: string;
  userMetaJson: string;
};

export async function createAudit(
  _prev: CreateAuditState,
  input: FormData | CreateAuditInput,
): Promise<CreateAuditState> {
  try {
    // Allow both ADMIN and AUDIT_OWNER to create audits
    const admin = await requireUser();
    if (admin.role !== "ADMIN" && admin.role !== "AUDIT_OWNER") {
      return { ok: false, error: "Not authorized to create audits" };
    }
    let title: string, description: string, startAt: string, endAt: string,
        status: string, timezone: string, frontRoomsCount: number, backRoomsCount: number,
        statusColumnsJson: string, roomRolesJson: string, userMetaJson: string;

    if (input instanceof FormData) {
      title = String(input.get("title") ?? "").trim();
      description = String(input.get("description") ?? "").trim();
      startAt = String(input.get("startAt") ?? "");
      endAt = String(input.get("endAt") ?? "");
      status = String(input.get("status") ?? "DRAFT");
      timezone = String(input.get("timezone") ?? "UTC");
      frontRoomsCount = Number(input.get("frontRoomsCount") ?? 0);
      backRoomsCount = Number(input.get("backRoomsCount") ?? 0);
      statusColumnsJson = String(input.get("statusColumnsJson") ?? "[]");
      roomRolesJson = String(input.get("roomRolesJson") ?? "");
      userMetaJson = String(input.get("userMetaJson") ?? "{}");
    } else {
      title = (input.title ?? "").trim();
      description = (input.description ?? "").trim();
      startAt = input.startAt ?? "";
      endAt = input.endAt ?? "";
      status = input.status ?? "DRAFT";
      timezone = input.timezone ?? "UTC";
      frontRoomsCount = Number(input.frontRoomsCount ?? 0);
      backRoomsCount = Number(input.backRoomsCount ?? 0);
      statusColumnsJson = input.statusColumnsJson ?? "[]";
      roomRolesJson = input.roomRolesJson ?? "";
      userMetaJson = input.userMetaJson ?? "{}";
    }

    if (!title) return { ok: false, error: "Title is required" };
    if (!Number.isInteger(frontRoomsCount) || frontRoomsCount < 1 || frontRoomsCount > 50) {
      return { ok: false, error: "Front rooms must be between 1 and 50" };
    }
    if (!Number.isInteger(backRoomsCount) || backRoomsCount < 1 || backRoomsCount > 50) {
      return { ok: false, error: "Back rooms must be between 1 and 50" };
    }

    // Parse status columns JSON
    let statusColumns: Array<{ name: string; order: number; color: string }> = [];

    try {
      statusColumns = JSON.parse(statusColumnsJson);
    } catch (e) {
      return { ok: false, error: "Invalid data format" };
    }

    // Collect unique user IDs and role labels from roomRolesJson
    let assignedUserIds: string[] = [];
    let userRolesMap = new Map<string, string>();
    try {
      if (roomRolesJson) {
        userRolesMap = buildUserRolesFromJson(roomRolesJson);
        assignedUserIds = extractUserIdsFromJson(roomRolesJson);
      }
    } catch (e) {
      return { ok: false, error: "Invalid assignment data" };
    }

    // Auto-complete: if end date has passed and status is ACTIVE, store as COMPLETED
    let finalStatus = status as "DRAFT" | "ACTIVE" | "COMPLETED";
    if (finalStatus === "ACTIVE" && endAt) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(endAt);
      end.setHours(0, 0, 0, 0);
      if (today > end) finalStatus = "COMPLETED";
    }

    // Ensure all assigned users exist in the database BEFORE creating the audit.
    // Users may come from Azure AD search and not yet exist in DB — create placeholders.
    let userMeta: Record<string, { name?: string; email?: string; image?: string }> = {};
    try { userMeta = JSON.parse(userMetaJson); } catch { /* ignore */ }

    const confirmedUserIds: string[] = [];
    if (assignedUserIds.length > 0) {
      const existingUsers = await db.user.findMany({
        where: { id: { in: assignedUserIds } },
        select: { id: true },
      });
      const existingIds = new Set(existingUsers.map((u) => u.id));
      for (const userId of assignedUserIds) {
        if (existingIds.has(userId)) {
          confirmedUserIds.push(userId);
        } else {
          // Create placeholder user from Azure AD metadata
          const meta = userMeta[userId];
          const email = meta?.email;
          if (email) {
            try {
              await db.user.upsert({
                where: { email },
                update: { name: meta?.name ?? email, image: meta?.image ?? undefined },
                create: { id: userId, email, name: meta?.name ?? email, role: "USER", image: meta?.image ?? null },
              });
              confirmedUserIds.push(userId);
            } catch {
              // Skip if creation fails (e.g. id conflict)
            }
          }
        }
      }
    }

    // Generate audit trackId in format YYYY-####
    // Reuses gaps: if e.g. 0008 was deleted, the next audit gets 0008.
    const year = new Date().getFullYear();
    const prefix = `${year}-`;
    const existingTrackIds = await db.audit.findMany({
      where: { trackId: { startsWith: prefix } },
      select: { trackId: true },
    });
    const usedSeqs = new Set(
      existingTrackIds
        .map((a) => parseInt(a.trackId!.split("-")[1] ?? "0", 10))
        .filter((n) => !isNaN(n) && n > 0),
    );
    let seq = 1;
    while (usedSeqs.has(seq)) seq++;
    const trackId = `${year}-${String(seq).padStart(4, "0")}`;

    const audit = await db.audit.create({
      data: {
        trackId,
        title,
        description: description || null,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        status: finalStatus,
        timezone,
        frontRoomsCount,
        backRoomsCount,
        roomRolesJson: roomRolesJson || null,
        createdById: admin.id,
        createdByName: admin.name ?? admin.email ?? "Admin",
        requestStatuses: {
          create: statusColumns.map((col) => ({
            name: col.name,
            order: col.order,
            color: col.color,
          })),
        },
        users: {
          create: confirmedUserIds.map((userId) => ({
            userId,
            role: userRolesMap.get(userId) ?? "Participant",
          })),
        },
      },
    });

    // Seed per-audit track number counters starting at 1
    await db.appConfig.createMany({
      data: [
        { key: `formalNext:${audit.id}`, value: "1" },
        { key: `informalNext:${audit.id}`, value: "1" },
      ],
    });

    // Auto-create audit folder structure under AuditTool/Audits/ (physical folders only, no DB entries)
    void (async () => {
      try {
        const safeTitle = title.replace(/[^a-zA-Z0-9._\- ]/g, "_");
        const foldersToCreate = [
          ["Audits"],
          ["Audits", safeTitle],
          ["Audits", safeTitle, "Requests"],
          ["Audits", safeTitle, "Chat"],
          ["Audits", safeTitle, "Auditors"],
        ];
        for (const segments of foldersToCreate) {
          const { createFolder } = await import("@/server/lib/oneDriveClient");
          const { join } = await import("path");
          const localDir = join(process.cwd(), "public", "uploads", "AuditTool", ...segments);
          await createFolder(segments.join("/"), localDir);
        }
      } catch (err) {
        console.error("[createAudit] Failed to create audit folder structure:", err);
      }
    })();

    await logActivity({
      type: "AUDIT_CREATED",
      actorName: admin.name ?? admin.email ?? "Admin",
      targetId: audit.id,
      targetTitle: title,
      meta: {
        auditName: title,
        status,
        frontRooms: String(frontRoomsCount),
        backRooms: String(backRoomsCount),
        startAt: startAt || "",
        endAt: endAt || "",
      },
    });

    // Create Outlook calendar event (fire-and-forget, don't block audit creation)
    // Only send calendar invites when audit is ACTIVE — DRAFT should not bother assignees
    if (finalStatus === "ACTIVE" && startAt && endAt) {
      void (async () => {
        try {
          const attendees = confirmedUserIds.length > 0
            ? await db.user.findMany({
                where: { id: { in: confirmedUserIds } },
                select: { email: true, name: true, id: true },
              })
            : [];

          const attendeeEmails = attendees.map((u) => u.email).filter((e): e is string => !!e);

          const eventBody = buildEventBody({
            auditTitle: title,
            description: description || undefined,
            frontRooms: frontRoomsCount,
            backRooms: backRoomsCount,
            assignees: attendees.map((u) => ({
              name: u.name ?? u.email ?? "Unknown",
              role: userRolesMap.get(u.id),
            })),
          });

          const event = await createCalendarEvent({
            subject: `[Upcoming Audit] ${title}`,
            body: eventBody,
            startAt: new Date(startAt),
            endAt: new Date(endAt),
            timezone,
            attendeeEmails,
            reminderMinutes: 60,
            categories: ["Audit"],
          });

          if (event?.id) {
            // Use raw SQL to save outlookEventId (Prisma client may not have this field typed yet)
            await db.$executeRawUnsafe(
              `UPDATE [dbo].[Audit] SET outlookEventId = @P1 WHERE id = @P2`,
              event.id,
              audit.id
            );
            console.log("[Outlook] Saved event ID", event.id, "for audit", audit.id);
          }
        } catch (err) {
          console.error("Failed to create calendar event for audit:", err);
        }
      })();
    }

    if (assignedUserIds.length > 0) {
      const assignedUsers = await db.user.findMany({
        where: { id: { in: assignedUserIds } },
        select: { id: true, name: true, email: true },
      });
      const assigneeNames = assignedUsers.map(u => {
        const name = u.name ?? u.email ?? "Unknown";
        const role = userRolesMap.get(u.id);
        return role ? `${name} as ${role}` : name;
      }).join(", ");
      await logActivity({
        type: "USER_ASSIGNED_AUDIT",
        actorName: admin.name ?? admin.email ?? "Admin",
        targetId: audit.id,
        targetTitle: title,
        meta: {
          auditName: title,
          assignedCount: String(assignedUserIds.length),
          assigneeNames,
        },
        // Only notify assignees when audit is ACTIVE (DRAFT should not bother them)
        notifyUserIds: finalStatus === "ACTIVE" ? assignedUserIds.filter(id => id !== admin.id) : [],
      });
    }

    emitGlobalEvent("audits");
    const dashboardBase = admin.role === "AUDIT_OWNER" ? "/auditOwnerDashboard" : "/adminDashboard";
    redirect(`${dashboardBase}/audits/${audit.id}`);
  } catch (error) {
    // Don't catch redirect errors - they need to bubble up
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }
    console.error("Error creating audit:", error);
    return { ok: false, error: "Failed to create audit. Please try again." };
  }
}

export async function cancelAudit(auditId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();

    const audit = await db.audit.findUnique({
      where: { id: auditId },
      select: { title: true, status: true },
    });

    if (!audit) {
      return { ok: false, error: "Audit not found." };
    }

    if (audit.status === "ARCHIVED") {
      return { ok: true };
    }

    // Read outlookEventId via raw SQL (Prisma client may not have this field typed yet)
    const rows = await db.$queryRawUnsafe<Array<{ outlookEventId: string | null }>>(
      `SELECT outlookEventId FROM [dbo].[Audit] WHERE id = @P1`,
      auditId
    );
    const outlookEventId = rows[0]?.outlookEventId ?? null;

    // Remove associated calendar event if one exists
    if (outlookEventId) {
      void deleteCalendarEvent(outlookEventId);
    }

    await db.audit.update({
      where: { id: auditId },
      data: {
        status: "ARCHIVED",
      },
    });

    await logActivity({
      type: "AUDIT_ARCHIVED",
      actorName: admin.name ?? admin.email ?? "Admin",
      targetId: auditId,
      targetTitle: audit.title ?? auditId,
      meta: { previousStatus: audit.status ?? "" },
    });

    emitGlobalEvent("audits");
    return { ok: true };
  } catch (error) {
    console.error("Error cancelling audit:", error);
    return { ok: false, error: "Failed to cancel audit. Please try again." };
  }
}