import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { MyFeedbackUI } from "./ui";

export default async function MyFeedbackPage() {
  const user = await requireUser();

  const feedbacks = await db.feedback.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
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
    <MyFeedbackUI
      currentUserId={user.id}
      currentUserName={user.name ?? ""}
      currentUserImage={user.image ?? null}
      feedbacks={feedbacks.map((f) => ({
        id: f.id,
        rating: f.rating,
        comment: f.comment,
        createdAt: f.createdAt.toISOString(),
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
