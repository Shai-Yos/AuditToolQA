import { db } from "@/server/db";
import { createNotifications, type NotificationType } from "./notifications";

export type ActivityType =
  | "AUDIT_CREATED"
  | "AUDIT_UPDATED"
  | "AUDIT_ARCHIVED"
  | "REQUEST_CREATED"
  | "REQUEST_UPDATED"
  | "REQUEST_MOVED"
  | "REQUEST_CANCELLED"
  | "REQUEST_DELETED"
  | "USER_ASSIGNED_REQUEST"
  | "USER_UNASSIGNED_REQUEST"
  | "USER_ASSIGNED_AUDIT"
  | "USER_UNASSIGNED_AUDIT"
  | "USER_ROLE_UPDATED_AUDIT"
  | "FEEDBACK_RECEIVED"
  | "ACCESS_REQUEST_SUBMITTED"
  | "ACCESS_REQUEST_APPROVED"
  | "ACCESS_REQUEST_REJECTED";

// Map activity types to notification types + resolve affected users
const NOTIFICATION_MAP: Partial<
  Record<ActivityType, { type: NotificationType; titleFn: (t: string, actor: string) => string; messageFn: (t: string, actor: string, meta?: Record<string, string>) => string }>
> = {
  USER_ASSIGNED_AUDIT: {
    type: "AUDIT_ASSIGNED",
    titleFn: (_t, _a) => "Assigned to Audit",
    messageFn: (t, actor) => `${actor} assigned you to audit "${t}"`,
  },
  USER_UNASSIGNED_AUDIT: {
    type: "AUDIT_UNASSIGNED",
    titleFn: () => "Removed from Audit",
    messageFn: (t, actor) => `${actor} removed you from audit "${t}"`,
  },
  USER_ASSIGNED_REQUEST: {
    type: "REQUEST_ASSIGNED",
    titleFn: () => "Assigned to Request",
    messageFn: (t, actor) => `${actor} assigned you to request "${t}"`,
  },
  USER_UNASSIGNED_REQUEST: {
    type: "REQUEST_UNASSIGNED",
    titleFn: () => "Removed from Request",
    messageFn: (t, actor) => `${actor} removed you from request "${t}"`,
  },
  REQUEST_CREATED: {
    type: "REQUEST_CREATED",
    titleFn: () => "New Request",
    messageFn: (t, actor) => `${actor} created request "${t}"`,
  },
  REQUEST_UPDATED: {
    type: "REQUEST_UPDATED",
    titleFn: () => "Request Updated",
    messageFn: (t, actor) => `${actor} updated request "${t}"`,
  },
  REQUEST_MOVED: {
    type: "REQUEST_MOVED",
    titleFn: () => "Request Moved",
    messageFn: (t, actor, meta) =>
      `${actor} moved request "${t}" to ${meta?.newStatus ?? "a new status"}`,
  },
  ACCESS_REQUEST_SUBMITTED: {
    type: "ACCESS_REQUEST_SUBMITTED",
    titleFn: () => "New Access Request",
    messageFn: (t, actor, meta) =>
      `${actor} requested ${meta?.requestedRole ? `${meta.requestedRole} ` : ""}access`,
  },
  ACCESS_REQUEST_APPROVED: {
    type: "ACCESS_REQUEST_APPROVED",
    titleFn: () => "Access Request Approved",
    messageFn: (t, actor, meta) =>
      `${actor} approved ${t}${meta?.grantedRole ? ` as ${meta.grantedRole}` : ""}`,
  },
  ACCESS_REQUEST_REJECTED: {
    type: "ACCESS_REQUEST_REJECTED",
    titleFn: () => "Access Request Rejected",
    messageFn: (t, actor) => `${actor} rejected ${t}'s access request`,
  },
};

export async function logActivity({
  type,
  actorName,
  targetId,
  targetTitle,
  meta,
  notifyUserIds,
}: {
  type: ActivityType;
  actorName: string;
  targetId: string;
  targetTitle: string;
  meta?: Record<string, string>;
  /** User IDs to send notifications to (excluding the actor). */
  notifyUserIds?: string[];
}) {
  try {
    await db.activityLog.create({
      data: {
        action: type,
        actorName,
        targetId,
        targetTitle,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });

    // Send notifications if a mapping exists for this activity type
    const mapping = NOTIFICATION_MAP[type];
    if (mapping) {
      // Resolve the auditId from the event so we can find the audit owner
      let auditId: string | undefined;
      if (type === "REQUEST_CREATED" || type.startsWith("AUDIT_") || type === "USER_ASSIGNED_AUDIT" || type === "USER_UNASSIGNED_AUDIT" || type === "USER_ROLE_UPDATED_AUDIT") {
        auditId = targetId;
      } else if (meta?.auditId) {
        auditId = meta.auditId;
      }

      // Always include all admin users (they have visibility into everything)
      const [adminUsers, auditOwnerRecord] = await Promise.all([
        db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
        auditId
          ? db.audit.findUnique({ where: { id: auditId }, select: { createdById: true } })
          : Promise.resolve(null),
      ]);
      const adminIds = adminUsers.map((u) => u.id);
      const auditOwnerIds = auditOwnerRecord?.createdById ? [auditOwnerRecord.createdById] : [];

      // Merge explicit notifyUserIds + admins + audit owner, deduplicate
      const explicit = notifyUserIds ?? [];
      const allIds = [...new Set([...explicit, ...adminIds, ...auditOwnerIds])];

      // Remove the actor so they don't get notified about their own action
      const actor = await db.user.findFirst({
        where: {
          OR: [{ name: actorName }, { email: actorName }],
        },
        select: { id: true },
      });
      const finalIds = actor
        ? allIds.filter((id) => id !== actor.id)
        : allIds;

      if (finalIds.length > 0) {
        const { linkAdmin, linkUser } = buildLinks(type, targetId, meta);
        await createNotifications(
          finalIds.map((userId) => ({
            userId,
            type: mapping.type,
            title: mapping.titleFn(targetTitle, actorName),
            message: mapping.messageFn(targetTitle, actorName, meta),
            linkAdmin,
            linkUser,
          })),
        );
      }
    }
  } catch {
    // Never let activity logging crash a real operation
  }
}

function buildLinks(
  type: ActivityType,
  targetId: string,
  meta?: Record<string, string>,
): { linkAdmin?: string; linkUser?: string } {
  // Request-related types: targetId is requestId, meta.auditId is the audit
  // Exception: REQUEST_CREATED uses targetId = auditId (no meta.auditId)
  if (type === "REQUEST_CREATED") {
    // targetId is the auditId for REQUEST_CREATED
    return {
      linkAdmin: `/adminDashboard/audits/${targetId}/kanbanBoard`,
      linkUser: `/userDashboard/audits/${targetId}/kanbanBoard`,
    };
  }
  if (type.startsWith("REQUEST_") || type === "USER_ASSIGNED_REQUEST" || type === "USER_UNASSIGNED_REQUEST") {
    const auditId = meta?.auditId;
    if (auditId) {
      return {
        linkAdmin: `/adminDashboard/audits/${auditId}/requests/${targetId}`,
        linkUser: `/userDashboard/audits/${auditId}/requests/${targetId}`,
      };
    }
    // Fallback: link to the request without audit context
    return {
      linkAdmin: `/adminDashboard/allRequests`,
      linkUser: `/userDashboard`,
    };
  }
  if (type.startsWith("AUDIT_") || type === "USER_ASSIGNED_AUDIT" || type === "USER_UNASSIGNED_AUDIT" || type === "USER_ROLE_UPDATED_AUDIT") {
    return {
      linkAdmin: `/adminDashboard/audits/${targetId}`,
      linkUser: `/userDashboard/audits/${targetId}`,
    };
  }
  if (type === "FEEDBACK_RECEIVED") {
    return {
      linkAdmin: `/adminDashboard/feedback`,
    };
  }
  if (type.startsWith("ACCESS_REQUEST_")) {
    return {
      linkAdmin: `/adminDashboard/accessRequests`,
    };
  }
  return {};
}
