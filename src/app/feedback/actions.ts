"use server";

import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { logActivity } from "@/server/helpers/logActivity";
import { createNotifications } from "@/server/helpers/notifications";
import { emitFeedbackEvent } from "@/server/lib/event-bus";

type FeedbackState = { ok: true } | { ok: false; error: string };

export async function submitFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const user = await requireUser();

  const rating = Number(formData.get("rating"));
  const comment = (formData.get("comment") as string)?.trim() || null;

  if (!rating || rating < 1 || rating > 5) {
    return { ok: false, error: "Please select a rating (1-5)." };
  }

  if (comment && comment.length > 2000) {
    return { ok: false, error: "Comment must be 2000 characters or less." };
  }

  await db.feedback.create({
    data: {
      userId: user.id,
      userName: user.name ?? user.email ?? "Unknown",
      rating,
      comment,
    },
  });

  // Notify all admins about new feedback (excluding the submitter)
  const actorName = user.name ?? user.email ?? "Unknown";
  try {
    const recipients = await db.user.findMany({
      where: { role: { in: ["ADMIN"] }, id: { not: user.id } },
      select: { id: true },
    });

    await createNotifications(
      recipients.map((r) => ({
        userId: r.id,
        type: "FEEDBACK_RECEIVED" as const,
        title: "New Feedback Received",
        message: `${actorName} submitted feedback (${rating} ★)`,
        linkAdmin: "/adminDashboard/feedback",
      })),
    );

    await logActivity({
      type: "FEEDBACK_RECEIVED",
      actorName,
      targetId: user.id,
      targetTitle: "Feedback",
      meta: { rating: String(rating) },
    });
  } catch {
    // Never let notification/logging crash the feedback submission
  }

  emitFeedbackEvent();
  return { ok: true };
}
