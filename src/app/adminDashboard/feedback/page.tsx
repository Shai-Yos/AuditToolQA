import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { FeedbackListUI } from "./ui";

export default async function AdminFeedbackPage() {
  const currentUser = await requireUser();

  const feedbacks = await db.feedback.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          userName: true,
          content: true,
          createdAt: true,
          user: { select: { image: true } },
        },
      },
    },
  });

  return (
    <FeedbackListUI
      currentUserId={currentUser.id}
      currentUserName={currentUser.name ?? ""}
      currentUserImage={currentUser.image ?? null}
      feedbacks={feedbacks.map((f) => ({
        id: f.id,
        userId: f.userId,
        isOwnFeedback: f.userId === currentUser.id,
        rating: f.rating,
        comment: f.comment,
        createdAt: f.createdAt.toISOString(),
        user: {
          id: f.user.id,
          name: f.user.name,
          email: f.user.email,
          image: f.user.image,
        },
        comments: f.comments.map((c) => ({
          id: c.id,
          userId: c.userId,
          userName: c.userName,
          image: c.user.image,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
        })),
      }))}
    />
  );
}
