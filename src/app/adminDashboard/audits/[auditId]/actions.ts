"use server";

import { db } from "~/server/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "~/server/helpers/currentUser";
import { logActivity } from "~/server/helpers/logActivity";
import { computeClosedAt } from "~/server/lib/requestStatus";

export async function updateRequestStatus(
  requestId: string,
  statusColumnId: string,
  auditId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Get the status column name
    const statusColumn = await db.requestStatus.findUnique({
      where: { id: statusColumnId },
      select: { name: true },
    });

    if (!statusColumn) {
      return { ok: false, error: "Status column not found" };
    }

    const currentRequest = await db.request.findUnique({
      where: { id: requestId },
      select: { title: true, trackNumber: true, statusName: true, auditTitle: true, closedAt: true },
    });

    const closedAt = computeClosedAt({
      fromStatusName: currentRequest?.statusName,
      toStatusName: statusColumn.name,
      currentClosedAt: currentRequest?.closedAt ?? null,
    });

    await db.request.update({
      where: { id: requestId },
      data: { 
        requestStatusId: statusColumnId,
        statusName: statusColumn.name,
        closedAt,
      },
    });

    const admin = await requireAdmin();

    // Notify assignees of this request
    const requestAssignees = await db.requestAssignee.findMany({
      where: { requestId },
      select: { userId: true },
    });
    const notifyIds = requestAssignees.map(a => a.userId).filter(id => id !== admin.id);

    await logActivity({
      type: "REQUEST_MOVED",
      actorName: admin.name ?? admin.email ?? "Admin",
      targetId: requestId,
      targetTitle: currentRequest?.trackNumber ?? currentRequest?.title ?? requestId,
      meta: {
        fromStatus: currentRequest?.statusName ?? "",
        toStatus: statusColumn.name,
        auditId,
        auditTitle: currentRequest?.auditTitle ?? "",
      },
      notifyUserIds: notifyIds,
    });

    revalidatePath(`/adminDashboard/audits/${auditId}`);
    return { ok: true };
  } catch (error) {
    console.error("Error updating request status:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to update request status";
    return { ok: false, error: errorMessage };
  }
}

export async function cancelRequest(
  requestId: string,
  auditId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cancelledColumn = await db.requestStatus.findFirst({
      where: { auditId, name: "Cancelled" },
      select: { id: true, name: true },
    });

    if (!cancelledColumn) {
      return { ok: false, error: "No 'Cancelled' status column found for this audit." };
    }

    const request = await db.request.findUnique({
      where: { id: requestId },
      select: { title: true, trackNumber: true, auditTitle: true, statusName: true, closedAt: true },
    });

    const closedAt = computeClosedAt({
      fromStatusName: request?.statusName,
      toStatusName: cancelledColumn.name,
      currentClosedAt: request?.closedAt ?? null,
    });

    await db.request.update({
      where: { id: requestId },
      data: {
        requestStatusId: cancelledColumn.id,
        statusName: cancelledColumn.name,
        closedAt,
      },
    });

    const admin = await requireAdmin();
    await logActivity({
      type: "REQUEST_CANCELLED",
      actorName: admin.name ?? admin.email ?? "Admin",
      targetId: requestId,
      targetTitle: request?.trackNumber ?? request?.title ?? requestId,
      meta: {
        fromStatus: request?.statusName ?? "",
        toStatus: cancelledColumn.name,
        auditId,
        auditTitle: request?.auditTitle ?? "",
      },
    });

    revalidatePath(`/adminDashboard/audits/${auditId}`);
    return { ok: true };
  } catch (error) {
    console.error("Error cancelling request:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to cancel request";
    return { ok: false, error: errorMessage };
  }
}

export async function reworkRequest(
  requestId: string,
  auditId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const firstColumn = await db.requestStatus.findFirst({
      where: { auditId },
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    });

    if (!firstColumn) {
      return { ok: false, error: "No status columns found for this audit." };
    }

    const request = await db.request.findUnique({
      where: { id: requestId },
      select: { title: true, trackNumber: true, auditTitle: true, statusName: true, closedAt: true },
    });

    const closedAt = computeClosedAt({
      fromStatusName: request?.statusName,
      toStatusName: firstColumn.name,
      currentClosedAt: request?.closedAt ?? null,
    });

    await db.request.update({
      where: { id: requestId },
      data: {
        requestStatusId: firstColumn.id,
        statusName: firstColumn.name,
        closedAt,
      },
    });

    const admin = await requireAdmin();
    await logActivity({
      type: "REQUEST_MOVED",
      actorName: admin.name ?? admin.email ?? "Admin",
      targetId: requestId,
      targetTitle: request?.trackNumber ?? request?.title ?? requestId,
      meta: {
        fromStatus: request?.statusName ?? "",
        toStatus: firstColumn.name,
        auditId,
        auditTitle: request?.auditTitle ?? "",
      },
    });

    revalidatePath(`/adminDashboard/audits/${auditId}`);
    return { ok: true };
  } catch (error) {
    console.error("Error reworking request:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to rework request";
    return { ok: false, error: errorMessage };
  }
}

export async function removeUserFromAudit(
  auditId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();

    const audit = await db.audit.findUnique({
      where: { id: auditId },
      select: {
        title: true,
        roomRolesJson: true,
        users: { where: { userId }, select: { userId: true } },
      },
    });

    if (!audit) return { ok: false, error: "Audit not found" };

    // Remove userId from all role arrays in roomRolesJson
    let updatedJson: string | null = audit.roomRolesJson ?? null;
    if (audit.roomRolesJson) {
      try {
        const parsed = JSON.parse(audit.roomRolesJson) as {
          fr?: Array<Record<string, unknown>>;
          br?: Array<Record<string, unknown>>;
        };
        const removeFromArrays = (obj: Record<string, unknown>) => {
          for (const key of Object.keys(obj)) {
            if (Array.isArray(obj[key])) {
              obj[key] = (obj[key] as string[]).filter((id) => id !== userId);
            }
          }
        };
        parsed.fr?.forEach(removeFromArrays);
        parsed.br?.forEach(removeFromArrays);
        updatedJson = JSON.stringify(parsed);
      } catch {
        // leave as-is if malformed
      }
    }

    // Get user name before deleting
    const removedUser = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const removedName = removedUser?.name ?? removedUser?.email ?? userId;

    await db.$transaction([
      db.auditAssignee.deleteMany({ where: { auditId, userId } }),
      db.audit.update({
        where: { id: auditId },
        data: { roomRolesJson: updatedJson },
      }),
    ]);

    await logActivity({
      type: "USER_UNASSIGNED_AUDIT",
      actorName: admin.name ?? admin.email ?? "Admin",
      targetId: auditId,
      targetTitle: audit.title,
      meta: {
        assigneeNames: removedName,
        assignedCount: "1",
      },
      notifyUserIds: [userId],
    });

    revalidatePath(`/adminDashboard/audits/${auditId}`);
    return { ok: true };
  } catch (error) {
    console.error("Error removing user from audit:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Failed to remove user" };
  }
}
