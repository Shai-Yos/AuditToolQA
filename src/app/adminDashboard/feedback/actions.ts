"use server";

import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { createNotifications } from "@/server/helpers/notifications";
import { revalidatePath } from "next/cache";
import { emitFeedbackEvent } from "@/server/lib/event-bus";

export async function addFeedbackComment(feedbackId: string, content: string) {
  const user = await requireUser();

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { ok: false, error: "Comment must be between 1 and 2000 characters." };
  }

  const feedback = await db.feedback.findUnique({
    where: { id: feedbackId },
    select: { userId: true, userName: true },
  });

  if (!feedback) {
    return { ok: false, error: "Feedback not found." };
  }

  // Only admins or the feedback owner can comment
  const isOwner = feedback.userId === user.id;
  if (user.role !== "ADMIN" && !isOwner) {
    return { ok: false, error: "You do not have permission to comment." };
  }

  await db.feedbackComment.create({
    data: {
      feedbackId,
      userId: user.id,
      userName: user.name ?? user.email ?? "Unknown",
      content: trimmed,
    },
  });

  const commenterName = user.name ?? user.email ?? "Unknown";

  if (isOwner) {
    // Feedback owner replied — notify all admins (excluding themselves)
    const recipients = await db.user.findMany({
      where: { role: { in: ["ADMIN"] }, id: { not: user.id } },
      select: { id: true },
    });

    await createNotifications(
      recipients.map((r) => ({
        userId: r.id,
        type: "FEEDBACK_REPLY" as const,
        title: "New Feedback Reply",
        message: `${commenterName} replied to their feedback`,
        linkAdmin: "/adminDashboard/feedback",
      })),
    );
  } else {
    // Admin replied — notify the feedback owner (not themselves)
    if (feedback.userId !== user.id) {
      await createNotifications([
        {
          userId: feedback.userId,
          type: "FEEDBACK_REPLY" as const,
          title: "New Feedback Reply",
          message: `${commenterName} replied to your feedback`,
          linkUser: "/userDashboard/my-feedback",
        },
      ]);
    }
  }

  emitFeedbackEvent();
  revalidatePath("/adminDashboard/feedback");
  revalidatePath("/userDashboard/my-feedback");

  return { ok: true };
}

export async function deleteFeedback(feedbackId: string) {
  const user = await requireUser();

  const feedback = await db.feedback.findUnique({
    where: { id: feedbackId },
    select: { userId: true },
  });

  if (!feedback) {
    return { ok: false, error: "Feedback not found." };
  }

  // Only the feedback owner or an admin can delete
  if (feedback.userId !== user.id && user.role !== "ADMIN") {
    return { ok: false, error: "You do not have permission to delete this feedback." };
  }

  await db.feedback.delete({ where: { id: feedbackId } });

  emitFeedbackEvent();
  revalidatePath("/adminDashboard/feedback");
  revalidatePath("/userDashboard/my-feedback");

  return { ok: true };
}
