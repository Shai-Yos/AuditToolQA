"use server";

import { db } from "~/server/db";
import { revalidatePath } from "next/cache";
import { requireUser } from "~/server/helpers/currentUser";
import { logActivity } from "~/server/helpers/logActivity";
import { computeClosedAt } from "~/server/lib/requestStatus";
import { syncRequestBucketToPlanner } from "~/server/lib/planner";

export async function updateRequestStatus(
  requestId: string,
  statusColumnId: string,
  auditId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
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

    const currentUser = await requireUser();

    // Notify assignees of this request
    const requestAssignees = await db.requestAssignee.findMany({
      where: { requestId },
      select: { userId: true },
    });
    const notifyIds = requestAssignees.map(a => a.userId).filter(id => id !== currentUser.id);

    await logActivity({
      type: "REQUEST_MOVED",
      actorName: currentUser.name ?? currentUser.email ?? "User",
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

    void syncRequestBucketToPlanner(requestId, statusColumn.name);
    revalidatePath(`/userDashboard/audits/${auditId}`);
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to update request status";
    return { ok: false, error: errorMessage };
  }
}
