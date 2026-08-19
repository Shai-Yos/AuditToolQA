"use server";

import { db } from "~/server/db";
import { requireUser } from "~/server/helpers/currentUser";
import { revalidatePath } from "next/cache";
import { createNotifications } from "~/server/helpers/notifications";
import { emitRequestEvent } from "~/server/lib/event-bus";
import { syncRequestCommentToPlanner, syncRequestNoteToPlanner } from "~/server/lib/planner";

// ─── Notes ───────────────────────────────────────────────────────────────────

export async function saveRequestNote(requestId: string, auditId: string, text: string) {
  const currentUser = await requireUser();
  const authorName = currentUser.name ?? currentUser.email ?? "Unknown";

  await db.request.update({
    where: { id: requestId },
    data: {
      noteText: text,
      noteLastEditedBy: authorName,
      noteLastEditedAt: new Date(),
    },
  });

  void syncRequestNoteToPlanner(requestId, authorName, text);

  emitRequestEvent(requestId, "notes");
  revalidatePath(`/adminDashboard/audits/${auditId}/requests/${requestId}`);
  revalidatePath(`/userDashboard/audits/${auditId}/requests/${requestId}`);
  return { ok: true as const };
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function addRequestComment(requestId: string, auditId: string, text: string) {
  const currentUser = await requireUser();
  if (!text.trim()) return { ok: false as const, error: "Comment cannot be empty." };

  const trimmed = text.trim();

  try {
    await db.$transaction([
      db.requestComment.create({
        data: {
          requestId,
          authorId: currentUser.id,
          authorName: currentUser.name ?? currentUser.email ?? "Unknown",
          authorImage: currentUser.image ?? null,
          text: trimmed,
        },
      }),
      db.request.update({
        where: { id: requestId },
        data: { updatedAt: new Date() },
      }),
    ]);
  } catch (err) {
    console.error("Failed to save comment:", err);
    return { ok: false as const, error: "Failed to save comment. Please try again." };
  }

  const authorName = currentUser.name ?? currentUser.email ?? "Unknown";
  void syncRequestCommentToPlanner(requestId, authorName, trimmed);

  // Fetch request info + all assignees for notifications
  const [request, requestAssignees, adminUsers] = await Promise.all([
    db.request.findUnique({
      where: { id: requestId },
      select: { title: true },
    }),
    db.requestAssignee.findMany({
      where: { requestId },
      select: { userId: true },
    }),
    db.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    }),
  ]);

  const requestTitle = request?.title ?? "a request";

  // Collect all user IDs who should be notified (assignees + admins, excluding the author)
  const allNotifyIds = new Set<string>();
  for (const a of requestAssignees) allNotifyIds.add(a.userId);
  for (const a of adminUsers) allNotifyIds.add(a.id);
  allNotifyIds.delete(currentUser.id);

  // Detect @mentions by matching known user names in the text
  const allUsers = await db.user.findMany({
    select: { id: true, name: true },
  });
  // Sort longest names first so "John Doe" matches before "John"
  const sortedUsers = allUsers
    .filter((u) => u.name)
    .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0));

  const mentionedIds = new Set<string>();
  for (const u of sortedUsers) {
    if (u.name && trimmed.includes(`@${u.name}`)) {
      mentionedIds.add(u.id);
    }
  }
  mentionedIds.delete(currentUser.id);

  // Build notifications: mention notifications for @mentioned users, comment notifications for others
  const notifications: Parameters<typeof createNotifications>[0] = [];

  for (const userId of allNotifyIds) {
    if (mentionedIds.has(userId)) {
      notifications.push({
        userId,
        type: "COMMENT_MENTION" as const,
        title: "Mentioned in a comment",
        message: `${authorName} mentioned you in a comment on "${requestTitle}"`,
        linkAdmin: `/adminDashboard/audits/${auditId}/requests/${requestId}`,
        linkUser: `/userDashboard/audits/${auditId}/requests/${requestId}`,
      });
    } else {
      notifications.push({
        userId,
        type: "COMMENT_MENTION" as const,
        title: "New comment",
        message: `${authorName} commented on "${requestTitle}"`,
        linkAdmin: `/adminDashboard/audits/${auditId}/requests/${requestId}`,
        linkUser: `/userDashboard/audits/${auditId}/requests/${requestId}`,
      });
    }
  }

  // Also notify @mentioned users who are NOT assignees/admins
  for (const userId of mentionedIds) {
    if (!allNotifyIds.has(userId)) {
      notifications.push({
        userId,
        type: "COMMENT_MENTION" as const,
        title: "Mentioned in a comment",
        message: `${authorName} mentioned you in a comment on "${requestTitle}"`,
        linkAdmin: `/adminDashboard/audits/${auditId}/requests/${requestId}`,
        linkUser: `/userDashboard/audits/${auditId}/requests/${requestId}`,
      });
    }
  }

  if (notifications.length > 0) {
    await createNotifications(notifications);
  }

  emitRequestEvent(requestId, "comments");
  revalidatePath(`/adminDashboard/audits/${auditId}/requests/${requestId}`);
  revalidatePath(`/userDashboard/audits/${auditId}/requests/${requestId}`);
  return { ok: true as const };
}

export async function deleteRequestComment(commentId: string, requestId: string, auditId: string) {
  const currentUser = await requireUser();
  const comment = await db.requestComment.findUnique({ where: { id: commentId }, select: { authorId: true } });
  if (!comment) return { ok: false as const, error: "Comment not found." };
  if (comment.authorId !== currentUser.id && currentUser.role !== "ADMIN") {
    return { ok: false as const, error: "Not authorized." };
  }

  await db.$transaction([
    db.requestComment.delete({ where: { id: commentId } }),
    db.request.update({
      where: { id: requestId },
      data: { updatedAt: new Date() },
    }),
  ]);
  emitRequestEvent(requestId, "comments");
  revalidatePath(`/adminDashboard/audits/${auditId}/requests/${requestId}`);
  revalidatePath(`/userDashboard/audits/${auditId}/requests/${requestId}`);
  return { ok: true as const };
}
