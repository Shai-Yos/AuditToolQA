import { db } from "~/server/db";
import type { AuditTabCounts } from "~/server/lib/event-bus";

export async function getAuditTabCounts(
  auditId: string,
  excludeUserId?: string,
): Promise<AuditTabCounts> {
  const requestWhere = excludeUserId
    ? { auditId, createdById: { not: excludeUserId } }
    : { auditId };

  const chatWhere = excludeUserId
    ? { auditId, authorId: { not: excludeUserId } }
    : { auditId };

  const [requestCount, assigneeCount, chatCount] = await Promise.all([
    db.request.count({ where: requestWhere }),
    db.auditAssignee.count({ where: { auditId } }),
    db.chatMessage.count({ where: chatWhere }),
  ]);

  return {
    requests: requestCount,
    kanban: requestCount,
    assignees: assigneeCount,
    chat: chatCount,
  };
}
