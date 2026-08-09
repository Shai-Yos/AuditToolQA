"use server";

import { db } from "@/server/db";
import { requireAuditOwner } from "@/server/helpers/currentUser";
import { logActivity } from "@/server/helpers/logActivity";
import { deleteCalendarEvent } from "@/server/lib/outlookCalendar";
import { emitGlobalEvent } from "@/server/lib/event-bus";

export async function cancelAudit(auditId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireAuditOwner();

    const audit = await db.audit.findUnique({
      where: { id: auditId },
      select: { title: true, status: true, createdById: true },
    });

    if (!audit) {
      return { ok: false, error: "Audit not found." };
    }

    if (audit.createdById !== user.id) {
      return { ok: false, error: "You can only cancel audits you created." };
    }

    if (audit.status === "ARCHIVED") {
      return { ok: true };
    }

    const rows = await db.$queryRawUnsafe<Array<{ outlookEventId: string | null }>>(
      `SELECT outlookEventId FROM [dbo].[Audit] WHERE id = @P1`,
      auditId,
    );
    const outlookEventId = rows[0]?.outlookEventId ?? null;

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
      actorName: user.name ?? user.email ?? "Audit Owner",
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
