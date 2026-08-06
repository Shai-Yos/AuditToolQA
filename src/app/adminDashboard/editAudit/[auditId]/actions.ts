
"use server";

import { db } from "@/server/db";
import { requireAdmin, requireUser } from "@/server/helpers/currentUser";
import { logActivity } from "@/server/helpers/logActivity";
import { redirect } from "next/navigation";
import { createCalendarEvent, updateCalendarEvent, cancelCalendarEvent, buildEventBody } from "@/server/lib/outlookCalendar";
import { emitAuditEvent, emitGlobalEvent } from "@/server/lib/event-bus";

type State = { ok: true; saved?: boolean } | { ok: false; error: string };

type StatusColumnInput = {
  name: string;
  order: number;
  color: string;
};

export type UpdateAuditInput = {
  title: string;
  description: string;
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  frontRoomsCount: number;
  backRoomsCount: number;
  statusColumnsJson: string;
  roomRolesJson: string;
  userMetaJson: string;
  noRedirect?: string;
};

export async function updateAudit(
  auditId: string,
  _prevState: State,
  input: FormData | UpdateAuditInput
): Promise<State> {
  let noRedirect = false;
  try {
    // Allow ADMIN or AUDIT_OWNER (ownership checked below)
    const admin = await requireUser();
    if (admin.role !== "ADMIN" && admin.role !== "AUDIT_OWNER") {
      return { ok: false, error: "Not authorized to edit audits" };
    }
    // AUDIT_OWNER: verify they own this audit + it's not completed
    if (admin.role === "AUDIT_OWNER") {
      const auditCheck = await db.audit.findUnique({ where: { id: auditId }, select: { createdById: true, status: true } });
      if (!auditCheck) return { ok: false, error: "Audit not found" };
      if (auditCheck.createdById !== admin.id) return { ok: false, error: "You can only edit your own audits" };
      if (auditCheck.status === "COMPLETED") return { ok: false, error: "Cannot edit a completed audit" };
    }

    let title: string, description: string, status: string, startAt: string, endAt: string;
    let timezone: string;
    let frontRoomsCount: number, backRoomsCount: number;
    let roomRolesJson: string | null, statusColumnsJson: string, userMetaJson: string;

    if (input instanceof FormData) {
      title = input.get("title") as string;
      description = input.get("description") as string;
      status = input.get("status") as string;
      startAt = input.get("startAt") as string;
      endAt = input.get("endAt") as string;
      timezone = (input.get("timezone") as string) || "UTC";
      frontRoomsCount = Number(input.get("frontRoomsCount"));
      backRoomsCount = Number(input.get("backRoomsCount"));
      roomRolesJson = input.get("roomRolesJson") as string | null;
      statusColumnsJson = input.get("statusColumnsJson") as string;
      userMetaJson = String(input.get("userMetaJson") ?? "{}");
      noRedirect = input.get("noRedirect") === "true";
    } else {
      title = input.title;
      description = input.description;
      status = input.status;
      startAt = input.startAt;
      endAt = input.endAt;
      timezone = input.timezone || "UTC";
      frontRoomsCount = Number(input.frontRoomsCount);
      backRoomsCount = Number(input.backRoomsCount);
      roomRolesJson = input.roomRolesJson;
      statusColumnsJson = input.statusColumnsJson;
      userMetaJson = input.userMetaJson ?? "{}";
      noRedirect = input.noRedirect === "true";
    }

    // Auto-complete: if end date has passed and status is ACTIVE, store as COMPLETED
    if (status === "ACTIVE" && endAt) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(endAt);
      end.setHours(0, 0, 0, 0);
      if (today > end) status = "COMPLETED";
    }

    if (!title?.trim()) {
      return { ok: false, error: "Title is required" };
    }

    const statusColumns: StatusColumnInput[] = JSON.parse(statusColumnsJson);

    // Collect unique user IDs from roomRolesJson
    let assignedUserIds: string[] = [];
    try {
      if (roomRolesJson) {
        const parsed = JSON.parse(roomRolesJson) as {
          fr?: Array<{ frIndex: number; leadUserIds: string[]; qmUserIds: string[]; smeUserIds?: string[]; transcriptionUserIds: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }>;
          br?: Array<{ brIndex: number; leadUserIds: string[]; callerUserIds: string[]; qmUserIds?: string[]; qualityReviewerUserIds: string[]; smePrepUserIds?: string[]; outgoingUserIds: string[]; incomingUserIds: string[]; recordsPrepUserIds: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }>;
        };
        const userIdSet = new Set<string>();
        for (const fr of parsed.fr ?? []) {
          fr.leadUserIds?.forEach((id) => userIdSet.add(id));
          fr.qmUserIds?.forEach((id) => userIdSet.add(id));
          fr.smeUserIds?.forEach((id) => userIdSet.add(id));
          fr.transcriptionUserIds?.forEach((id) => userIdSet.add(id));
          for (const cr of fr.customRoles ?? []) { cr.userIds?.forEach((id) => userIdSet.add(id)); }
        }
        for (const br of parsed.br ?? []) {
          br.leadUserIds?.forEach((id) => userIdSet.add(id));
          br.callerUserIds?.forEach((id) => userIdSet.add(id));
          br.qmUserIds?.forEach((id) => userIdSet.add(id));
          br.qualityReviewerUserIds?.forEach((id) => userIdSet.add(id));
          br.smePrepUserIds?.forEach((id) => userIdSet.add(id));
          br.outgoingUserIds?.forEach((id) => userIdSet.add(id));
          br.incomingUserIds?.forEach((id) => userIdSet.add(id));
          br.recordsPrepUserIds?.forEach((id) => userIdSet.add(id));
          for (const cr of br.customRoles ?? []) { cr.userIds?.forEach((id) => userIdSet.add(id)); }
        }
        assignedUserIds = Array.from(userIdSet);
      }
    } catch {
      return { ok: false, error: "Invalid assignment data" };
    }

    const oldAudit = await db.audit.findUnique({
      where: { id: auditId },
      select: { title: true, description: true, status: true, startAt: true, endAt: true, frontRoomsCount: true, backRoomsCount: true, roomRolesJson: true },
    });

    // Derive old assigned IDs from roomRolesJson (the authoritative source).
    // Avoids relying on AuditAssignee table which may have been empty due to past FK issues.
    const oldAssigneeIds = new Set<string>();
    if (oldAudit?.roomRolesJson) {
      try {
        const oldParsed = JSON.parse(oldAudit.roomRolesJson) as {
          fr?: Array<{ leadUserIds?: string[]; qmUserIds?: string[]; smeUserIds?: string[]; transcriptionUserIds?: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }>;
          br?: Array<{ leadUserIds?: string[]; callerUserIds?: string[]; qmUserIds?: string[]; qualityReviewerUserIds?: string[]; smePrepUserIds?: string[]; outgoingUserIds?: string[]; incomingUserIds?: string[]; recordsPrepUserIds?: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }>;
        };
        for (const fr of oldParsed.fr ?? []) {
          fr.leadUserIds?.forEach(id => oldAssigneeIds.add(id));
          fr.qmUserIds?.forEach(id => oldAssigneeIds.add(id));
          fr.smeUserIds?.forEach(id => oldAssigneeIds.add(id));
          fr.transcriptionUserIds?.forEach(id => oldAssigneeIds.add(id));
          for (const cr of fr.customRoles ?? []) { cr.userIds?.forEach(id => oldAssigneeIds.add(id)); }
        }
        for (const br of oldParsed.br ?? []) {
          br.leadUserIds?.forEach(id => oldAssigneeIds.add(id));
          br.callerUserIds?.forEach(id => oldAssigneeIds.add(id));
          br.qmUserIds?.forEach(id => oldAssigneeIds.add(id));
          br.qualityReviewerUserIds?.forEach(id => oldAssigneeIds.add(id));
          br.smePrepUserIds?.forEach(id => oldAssigneeIds.add(id));
          br.outgoingUserIds?.forEach(id => oldAssigneeIds.add(id));
          br.incomingUserIds?.forEach(id => oldAssigneeIds.add(id));
          br.recordsPrepUserIds?.forEach(id => oldAssigneeIds.add(id));
          for (const cr of br.customRoles ?? []) { cr.userIds?.forEach(id => oldAssigneeIds.add(id)); }
        }
      } catch { /* ignore malformed JSON */ }
    }

    // Ensure all assigned users exist in the User table BEFORE the transaction.
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
              // Skip if creation fails
            }
          }
        }
      }
    }

    await db.$transaction(async (tx) => {
      // Update audit with new room counts
      await tx.audit.update({
        where: { id: auditId },
        data: {
          title,
          description: description || null,
          status: status as "DRAFT" | "ACTIVE" | "COMPLETED",
          startAt: startAt ? new Date(startAt) : null,
          endAt: endAt ? new Date(endAt) : null,
          timezone,
          frontRoomsCount,
          backRoomsCount,
          roomRolesJson: roomRolesJson ?? null,
        },
      });

      // Get existing status columns
      const existingColumns = await tx.requestStatus.findMany({
        where: { auditId },
        orderBy: { order: 'asc' },
      });

      // Update existing columns and create new ones
      for (let i = 0; i < statusColumns.length; i++) {
        const col = statusColumns[i];
        if (!col) continue;
        
        const existingCol = existingColumns[i];
        
        if (existingCol) {
          // Update existing column
          await tx.requestStatus.update({
            where: { id: existingCol.id },
            data: {
              name: col.name,
              order: col.order,
              color: col.color || '#3b82f6',
            },
          });
        } else {
          // Create new column
          await tx.requestStatus.create({
            data: {
              auditId,
              name: col.name,
              order: col.order,
              color: col.color || '#3b82f6',
            },
          });
        }
      }

      // Delete excess columns if the user removed some
      if (existingColumns.length > statusColumns.length) {
        const idsToDelete = existingColumns.slice(statusColumns.length).map((c) => c.id);
        await tx.requestStatus.deleteMany({ where: { id: { in: idsToDelete } } });
      }

      // Sync AuditAssignee table: delete old, create new with proper role strings
      await tx.auditAssignee.deleteMany({ where: { auditId } });
      if (roomRolesJson && confirmedUserIds.length > 0) {
        const rolesMap = new Map<string, Set<string>>();
        const addR = (id: string, role: string) => {
          if (!rolesMap.has(id)) rolesMap.set(id, new Set());
          rolesMap.get(id)!.add(role);
        };
        const parsed2 = JSON.parse(roomRolesJson) as {
          fr?: Array<{ frIndex: number; leadUserIds?: string[]; qmUserIds?: string[]; smeUserIds?: string[]; transcriptionUserIds?: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }>;
          br?: Array<{ brIndex: number; leadUserIds?: string[]; callerUserIds?: string[]; qmUserIds?: string[]; qualityReviewerUserIds?: string[]; smePrepUserIds?: string[]; outgoingUserIds?: string[]; incomingUserIds?: string[]; recordsPrepUserIds?: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }>;
        };
        for (const fr of parsed2.fr ?? []) {
          const p = `FR${fr.frIndex}`;
          fr.leadUserIds?.forEach((id) => addR(id, `${p} Lead`));
          fr.qmUserIds?.forEach((id) => addR(id, `${p} QM`));
          fr.smeUserIds?.forEach((id) => addR(id, `${p} SME`));
          fr.transcriptionUserIds?.forEach((id) => addR(id, `${p} Transcriptionist`));
          for (const cr of fr.customRoles ?? []) { cr.userIds?.forEach((id) => addR(id, `${p} ${cr.name}`)); }
        }
        for (const br of parsed2.br ?? []) {
          const p = `BR${br.brIndex}`;
          br.leadUserIds?.forEach((id) => addR(id, `${p} Lead`));
          br.callerUserIds?.forEach((id) => addR(id, `${p} Caller`));
          br.qmUserIds?.forEach((id) => addR(id, `${p} QM`));
          br.qualityReviewerUserIds?.forEach((id) => addR(id, `${p} Quality Reviewer`));
          br.smePrepUserIds?.forEach((id) => addR(id, `${p} SME Prep`));
          br.outgoingUserIds?.forEach((id) => addR(id, `${p} Outgoing`));
          br.incomingUserIds?.forEach((id) => addR(id, `${p} Incoming`));
          br.recordsPrepUserIds?.forEach((id) => addR(id, `${p} Records Prep`));
          for (const cr of br.customRoles ?? []) { cr.userIds?.forEach((id) => addR(id, `${p} ${cr.name}`)); }
        }
        const users = await tx.user.findMany({
          where: { id: { in: confirmedUserIds } },
          select: { id: true, name: true },
        });
        const userNameMap = new Map(users.map((u) => [u.id, u.name ?? ""]));
        await tx.auditAssignee.createMany({
          data: confirmedUserIds.map((userId) => ({
            auditId,
            userId,
            role: Array.from(rolesMap.get(userId) ?? ["VIEWER"]).join(", "),
            auditName: title,
            userName: userNameMap.get(userId) ?? "",
          })),
        });
      }
    });

    const changes: string[] = [];
    if (oldAudit?.title !== title) changes.push(`Title: "${oldAudit?.title ?? ""}" → "${title}"`);
    if (oldAudit?.status !== status) changes.push(`Status: ${oldAudit?.status ?? ""} → ${status}`);
    if (oldAudit?.frontRoomsCount !== frontRoomsCount) changes.push(`Front Rooms: ${oldAudit?.frontRoomsCount ?? 0} → ${frontRoomsCount}`);
    if (oldAudit?.backRoomsCount !== backRoomsCount) changes.push(`Back Rooms: ${oldAudit?.backRoomsCount ?? 0} → ${backRoomsCount}`);
    const oldStart = oldAudit?.startAt?.toISOString().slice(0, 10) ?? "";
    const oldEnd = oldAudit?.endAt?.toISOString().slice(0, 10) ?? "";
    const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "none";
    if (fmtDate(oldStart) !== fmtDate(startAt || "")) changes.push(`Start: ${fmtDate(oldStart)} → ${fmtDate(startAt || "")}`);
    if (fmtDate(oldEnd) !== fmtDate(endAt || "")) changes.push(`End: ${fmtDate(oldEnd)} → ${fmtDate(endAt || "")}`);

    const userRoles = new Map<string, Set<string>>();
    if (roomRolesJson) {
      try {
        const parsed = JSON.parse(roomRolesJson) as { fr?: Array<{ leadUserIds?: string[]; qmUserIds?: string[]; smeUserIds?: string[]; transcriptionUserIds?: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }>; br?: Array<{ leadUserIds?: string[]; callerUserIds?: string[]; qmUserIds?: string[]; qualityReviewerUserIds?: string[]; smePrepUserIds?: string[]; outgoingUserIds?: string[]; incomingUserIds?: string[]; recordsPrepUserIds?: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }> };
        const addRole = (id: string, role: string) => { if (!userRoles.has(id)) userRoles.set(id, new Set()); userRoles.get(id)!.add(role); };
        for (const fr of parsed.fr ?? []) {
          fr.leadUserIds?.forEach(id => addRole(id, "FR Lead"));
          fr.qmUserIds?.forEach(id => addRole(id, "QM"));
          fr.smeUserIds?.forEach(id => addRole(id, "SME"));
          fr.transcriptionUserIds?.forEach(id => addRole(id, "Transcriptionist"));
          for (const cr of fr.customRoles ?? []) { cr.userIds?.forEach(id => addRole(id, cr.name)); }
        }
        for (const br of parsed.br ?? []) {
          br.leadUserIds?.forEach(id => addRole(id, "BR Lead"));
          br.callerUserIds?.forEach(id => addRole(id, "Caller"));
          br.qmUserIds?.forEach(id => addRole(id, "BR QM"));
          br.qualityReviewerUserIds?.forEach(id => addRole(id, "Quality Reviewer"));
          br.smePrepUserIds?.forEach(id => addRole(id, "SME Prep"));
          br.outgoingUserIds?.forEach(id => addRole(id, "Outgoing"));
          br.incomingUserIds?.forEach(id => addRole(id, "Incoming"));
          br.recordsPrepUserIds?.forEach(id => addRole(id, "Records Prep"));
          for (const cr of br.customRoles ?? []) { cr.userIds?.forEach(id => addRole(id, cr.name)); }
        }
      } catch { /* ignore */ }
    }
    const assignedUsers = assignedUserIds.length > 0
      ? await db.user.findMany({ where: { id: { in: assignedUserIds } }, select: { id: true, name: true, email: true } })
      : [];
    const assigneeNames = assignedUsers.map(u => {
      const name = u.name ?? u.email ?? "Unknown";
      const roles = userRoles.get(u.id);
      return roles?.size ? `${name} as ${Array.from(roles).join(", ")}` : name;
    }).join(", ");

    const addedIds = assignedUserIds.filter(id => !oldAssigneeIds.has(id));
    const removedIds = Array.from(oldAssigneeIds).filter(id => !assignedUserIds.includes(id));

    // Detect role changes for users who remain assigned
    const buildRolesMap = (json: string | null): Map<string, Set<string>> => {
      const map = new Map<string, Set<string>>();
      if (!json) return map;
      try {
        const parsed = JSON.parse(json) as { fr?: Array<{ leadUserIds?: string[]; qmUserIds?: string[]; smeUserIds?: string[]; transcriptionUserIds?: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }>; br?: Array<{ leadUserIds?: string[]; callerUserIds?: string[]; qmUserIds?: string[]; qualityReviewerUserIds?: string[]; smePrepUserIds?: string[]; outgoingUserIds?: string[]; incomingUserIds?: string[]; recordsPrepUserIds?: string[]; customRoles?: Array<{ name: string; userIds: string[] }> }> };
        const add = (id: string, role: string) => { if (!map.has(id)) map.set(id, new Set()); map.get(id)!.add(role); };
        for (const fr of parsed.fr ?? []) {
          fr.leadUserIds?.forEach(id => add(id, "FR Lead"));
          fr.qmUserIds?.forEach(id => add(id, "QM"));
          fr.smeUserIds?.forEach(id => add(id, "SME"));
          fr.transcriptionUserIds?.forEach(id => add(id, "Transcriptionist"));
          for (const cr of fr.customRoles ?? []) { cr.userIds?.forEach(id => add(id, cr.name)); }
        }
        for (const br of parsed.br ?? []) {
          br.leadUserIds?.forEach(id => add(id, "BR Lead"));
          br.callerUserIds?.forEach(id => add(id, "Caller"));
          br.qmUserIds?.forEach(id => add(id, "BR QM"));
          br.qualityReviewerUserIds?.forEach(id => add(id, "Quality Reviewer"));
          br.smePrepUserIds?.forEach(id => add(id, "SME Prep"));
          br.outgoingUserIds?.forEach(id => add(id, "Outgoing"));
          br.incomingUserIds?.forEach(id => add(id, "Incoming"));
          br.recordsPrepUserIds?.forEach(id => add(id, "Records Prep"));
          for (const cr of br.customRoles ?? []) { cr.userIds?.forEach(id => add(id, cr.name)); }
        }
      } catch { /* ignore */ }
      return map;
    };
    const oldRolesMap = buildRolesMap(oldAudit?.roomRolesJson ?? null);
    const keptIds = assignedUserIds.filter(id => oldAssigneeIds.has(id));
    const roleChangedIds = keptIds.filter(id => {
      const oldRoles = Array.from(oldRolesMap.get(id) ?? []).sort().join(",");
      const newRoles = Array.from(userRoles.get(id) ?? []).sort().join(",");
      return oldRoles !== newRoles;
    });

    // Fetch any extra user lists needed for log messages, then fire all logActivity calls in parallel
    const [removedUsers, roleChangedUsers] = await Promise.all([
      removedIds.length > 0
        ? db.user.findMany({ where: { id: { in: removedIds } }, select: { name: true, email: true } })
        : Promise.resolve([] as Array<{ name: string | null; email: string | null }>),
      roleChangedIds.length > 0
        ? db.user.findMany({ where: { id: { in: roleChangedIds } }, select: { id: true, name: true, email: true } })
        : Promise.resolve([] as Array<{ id: string; name: string | null; email: string | null }>),
    ]);

    const actorName = admin.name ?? admin.email ?? "Admin";
    await Promise.all([
      changes.length > 0
        ? logActivity({
            type: "AUDIT_UPDATED",
            actorName,
            targetId: auditId,
            targetTitle: title,
            meta: {
              auditName: title,
              changedFields: changes.join("; "),
              status,
              frontRooms: String(frontRoomsCount),
              backRooms: String(backRoomsCount),
              startAt: startAt || "",
              endAt: endAt || "",
            },
          })
        : Promise.resolve(),
      addedIds.length > 0
        ? (() => {
            const addedUsers = assignedUsers.filter(u => addedIds.includes(u.id));
            const addedNames = addedUsers.map(u => {
              const name = u.name ?? u.email ?? "Unknown";
              const roles = userRoles.get(u.id);
              return roles?.size ? `${name} as ${Array.from(roles).join(", ")}` : name;
            }).join(", ");
            return logActivity({
              type: "USER_ASSIGNED_AUDIT",
              actorName,
              targetId: auditId,
              targetTitle: title,
              meta: {
                auditName: title,
                userName: addedUsers.map(u => u.name ?? u.email ?? "Unknown").join(", "),
                assignedCount: String(addedIds.length),
                assigneeNames: addedNames,
              },
              notifyUserIds: status === "ACTIVE" ? addedIds.filter(id => id !== admin.id) : [],
            });
          })()
        : Promise.resolve(),
      removedIds.length > 0
        ? logActivity({
            type: "USER_UNASSIGNED_AUDIT",
            actorName,
            targetId: auditId,
            targetTitle: title,
            meta: {
              assignedCount: String(removedIds.length),
              assigneeNames: removedUsers.map(u => u.name ?? u.email ?? "Unknown").join(", "),
            },
            notifyUserIds: status === "ACTIVE" ? removedIds : [],
          })
        : Promise.resolve(),
      roleChangedIds.length > 0
        ? (() => {
            const roleChangeSummary = roleChangedUsers.map(u => {
              const name = u.name ?? u.email ?? "Unknown";
              const oldR = Array.from(oldRolesMap.get(u.id) ?? []).join(", ") || "none";
              const newR = Array.from(userRoles.get(u.id) ?? []).join(", ") || "none";
              return `${name}: ${oldR} → ${newR}`;
            }).join("; ");
            return logActivity({
              type: "USER_ROLE_UPDATED_AUDIT",
              actorName,
              targetId: auditId,
              targetTitle: title,
              meta: { changes: roleChangeSummary },
              notifyUserIds: status === "ACTIVE" ? roleChangedIds : [],
            });
          })()
        : Promise.resolve(),
    ]);

    // Sync Outlook calendar event (fire-and-forget)
    // Only trigger calendar when audit is ACTIVE or transitioning to COMPLETED.
    // DRAFT audits should not send calendar invites or bother assignees.
    const shouldSyncCalendar =
      (status === "ACTIVE") ||
      (status === "COMPLETED" && oldAudit?.status !== "COMPLETED");

    console.log("[Outlook] Audit status:", status, "| shouldSyncCalendar:", shouldSyncCalendar);

    if (shouldSyncCalendar) {
    void (async () => {
      try {
        // Use $queryRawUnsafe to read outlookEventId since Prisma client may not have it typed yet
        const auditRows = await db.$queryRawUnsafe<Array<{ outlookEventId: string | null; timezone: string }>>(
          `SELECT outlookEventId, timezone FROM [dbo].[Audit] WHERE id = @P1`,
          auditId
        );
        const auditRow = auditRows[0];
        const outlookEventId = auditRow?.outlookEventId ?? null;
        const tz = timezone; // Use the timezone from the form input

        console.log("[Outlook] Sync for audit", auditId, "eventId:", outlookEventId);

        // If status changed to COMPLETED, cancel the calendar event
        if (status === "COMPLETED" && oldAudit?.status !== "COMPLETED" && outlookEventId) {
          await cancelCalendarEvent(
            outlookEventId,
            `Audit "${title}" has been completed.`
          );
          await db.$executeRawUnsafe(
            `UPDATE [dbo].[Audit] SET outlookEventId = NULL WHERE id = @P1`,
            auditId
          );
          return;
        }

        // Fetch ALL assigned users from the just-synced AuditAssignee table
        const assignees = await db.auditAssignee.findMany({
          where: { auditId },
          select: { userId: true, user: { select: { email: true, name: true, id: true } } },
        });

        const attendees = assignees.map((a) => a.user);
        const attendeeEmails = attendees.map((u) => u.email).filter((e): e is string => !!e);

        const eventBody = buildEventBody({
          auditTitle: title,
          description: description || undefined,
          frontRooms: frontRoomsCount,
          backRooms: backRoomsCount,
          assignees: attendees.map((u) => ({
            name: u.name ?? u.email ?? "Unknown",
            role: userRoles.get(u.id) ? Array.from(userRoles.get(u.id)!).join(", ") : undefined,
          })),
        });

        if (outlookEventId) {
          // Update existing event — body is merged with Teams meeting section preserved
          const success = await updateCalendarEvent(outlookEventId, {
            subject: `[Upcoming Audit] ${title}`,
            body: eventBody,
            startAt: startAt ? new Date(startAt) : undefined,
            endAt: endAt ? new Date(endAt) : undefined,
            timezone: tz,
            attendeeEmails,
          });
          console.log("[Outlook] Update result:", success);
        } else if (startAt && endAt) {
          // Create new event only if we have dates
          const event = await createCalendarEvent({
            subject: `[Upcoming Audit] ${title}`,
            body: eventBody,
            startAt: new Date(startAt),
            endAt: new Date(endAt),
            timezone: tz,
            attendeeEmails,
            reminderMinutes: 60,
            categories: ["Audit"],
          });
          if (event?.id) {
            await db.$executeRawUnsafe(
              `UPDATE [dbo].[Audit] SET outlookEventId = @P1 WHERE id = @P2`,
              event.id,
              auditId
            );
          }
          console.log("[Outlook] Created new event:", event?.id);
        }
      } catch (err) {
        console.error("Failed to sync calendar event for audit:", err);
      }
    })();
    } // end if (shouldSyncCalendar)
  } catch (error) {
    console.error("Error updating audit:", error);
    return { ok: false, error: "Failed to update audit" };
  }

  emitAuditEvent(auditId, "meta");
  emitGlobalEvent("audits");
  if (noRedirect) return { ok: true, saved: true };
  redirect(`/adminDashboard/audits/${auditId}/chats`);
  // Note: the noRedirect branch returns before reaching here
}
