import { db } from "@/server/db";

export type NotificationType =
  | "AUDIT_ASSIGNED"
  | "AUDIT_UNASSIGNED"
  | "REQUEST_ASSIGNED"
  | "REQUEST_UNASSIGNED"
  | "REQUEST_CREATED"
  | "REQUEST_UPDATED"
  | "REQUEST_MOVED"
  | "CHAT_MESSAGE"
  | "CHAT_MENTION"
  | "CHAT_REPLY"
  | "COMMENT_MENTION"
  | "FEEDBACK_RECEIVED"
  | "FEEDBACK_REPLY"
  | "ACCESS_REQUEST_SUBMITTED"
  | "ACCESS_REQUEST_APPROVED"
  | "ACCESS_REQUEST_REJECTED";

// Which preference key gates each type
const TYPE_TO_PREF: Record<NotificationType, "assignments" | "mentions" | "chat" | "requestActivity"> = {
  AUDIT_ASSIGNED: "assignments",
  AUDIT_UNASSIGNED: "assignments",
  REQUEST_ASSIGNED: "assignments",
  REQUEST_UNASSIGNED: "assignments",
  CHAT_MENTION: "mentions",
  CHAT_REPLY: "mentions",
  COMMENT_MENTION: "mentions",
  CHAT_MESSAGE: "chat",
  REQUEST_CREATED: "requestActivity",
  REQUEST_UPDATED: "requestActivity",
  REQUEST_MOVED: "requestActivity",
  FEEDBACK_RECEIVED: "requestActivity",
  FEEDBACK_REPLY: "requestActivity",
  ACCESS_REQUEST_SUBMITTED: "assignments",
  ACCESS_REQUEST_APPROVED: "assignments",
  ACCESS_REQUEST_REJECTED: "assignments",
};

/**
 * Create notifications for one or more users, respecting each user's
 * notification preferences (notifications with no preference key are always sent).
 */
export async function createNotifications(
  notifications: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    linkAdmin?: string;
    linkUser?: string;
  }[],
) {
  if (notifications.length === 0) return;

  try {
    // Batch-fetch preferences for all unique recipients
    const userIds = [...new Set(notifications.map((n) => n.userId))];

    // Use raw SQL — notifPreferences was added after last prisma generate
    const idList = userIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    const users = await db.$queryRawUnsafe<Array<{ id: string; notifPreferences: string | null }>>(
      `SELECT [id], [notifPreferences] FROM [dbo].[User] WHERE [id] IN (${idList})`,
    );

    type PrefsShape = { assignments: boolean; mentions: boolean; chat: boolean; requestActivity: boolean };
    const prefsMap = new Map<string, PrefsShape>();
    for (const u of users) {
      let prefs: PrefsShape = { assignments: true, mentions: true, chat: true, requestActivity: true };
      if (u.notifPreferences) {
        try {
          const parsed = JSON.parse(u.notifPreferences) as Partial<PrefsShape>;
          prefs = {
            assignments: parsed.assignments ?? true,
            mentions: parsed.mentions ?? true,
            chat: parsed.chat ?? true,
            requestActivity: parsed.requestActivity ?? true,
          };
        } catch {
          // malformed JSON — use defaults
        }
      }
      prefsMap.set(u.id, prefs);
    }

    // Filter out notifications the user has disabled
    // CHAT_REPLY is always delivered (it's a direct personal notification like a mention)
    const defaultPrefs: PrefsShape = { assignments: true, mentions: true, chat: true, requestActivity: true };
    const allowed = notifications.filter((n) => {
      if (n.type === "CHAT_REPLY") return true;
      const prefKey = TYPE_TO_PREF[n.type];
      const userPrefs = prefsMap.get(n.userId) ?? defaultPrefs;
      return userPrefs[prefKey];
    });

    if (allowed.length === 0) return;

    await db.notification.createMany({
      data: allowed.map((n) => ({
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        linkAdmin: n.linkAdmin ?? null,
        linkUser: n.linkUser ?? null,
      })),
    });
  } catch {
    // Never let notification creation crash a real operation
  }
}
