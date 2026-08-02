import { db } from "~/server/db";
import { notFound } from "next/navigation";
import { requireUser } from "~/server/helpers/currentUser";
import { getUserPhoto } from "~/server/lib/graphClient";
import RequestUI from "./ui";

export default async function Page({
  params,
}: {
  params: Promise<{ auditId: string; requestId: string }>;
}) {
  const { auditId, requestId } = await params;
  const currentUser = await requireUser();
  const [request, allUsers, comments] = await Promise.all([
    db.request.findFirst({
      where: { id: requestId, auditId: auditId },
      include: {
        documents: true,
        assignees: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        requestStatus: { select: { id: true, name: true, order: true } },
        audit: {
          select: {
            id: true,
            title: true,
            trackId: true,
            frontRoomsCount: true,
            requestStatuses: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true } },
          },
        },
      },
    }),
    db.user.findMany({
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: "asc" },
    }),
    db.requestComment.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!request) return notFound();

  // Fetch Azure AD photos for all users in parallel
  const photoMap = new Map<string, string | null>();
  await Promise.all(
    allUsers.map(async (u) => {
      const photo = await getUserPhoto(u.id).catch(() => null);
      photoMap.set(u.id, photo);
    })
  );

  return (
    <RequestUI
      auditId={request.audit.id}
      auditTitle={request.audit.title}
      auditTrackId={request.audit.trackId ?? null}
      frontRoomsCount={request.audit.frontRoomsCount}
      request={{
        id: request.id,
        title: request.title,
        trackNumber: request.trackNumber ?? null,
        labels: JSON.parse(request.labels) as string[],
        isFormal: request.isFormal,
        statusColumnId: request.requestStatusId,
        documents: request.documents.map((d) => ({ id: d.id, filename: d.filename, url: d.url })),
        assigneeIds: request.assignees.map((a) => a.userId),
        estimatedDeliveryDate: request.estimatedDeliveryDate ? request.estimatedDeliveryDate.toISOString().split("T")[0]! : null,
      }}
      auditPeople={allUsers.map((u) => ({
        id: u.id,
        name: u.name ?? u.email ?? u.id,
        image: photoMap.get(u.id) ?? u.image ?? null,
      }))}
      statusColumns={request.audit.requestStatuses.map((c) => ({ id: c.id, name: c.name }))}
      note={{ text: request.noteText ?? "", lastEditedBy: request.noteLastEditedBy ?? null, lastEditedAt: request.noteLastEditedAt?.toISOString() ?? null }}
      currentUserId={currentUser.id}
      currentUserName={currentUser.name ?? currentUser.email ?? currentUser.id}
      currentUserImage={photoMap.get(currentUser.id) ?? currentUser.image ?? null}
      comments={comments.map((c) => ({ id: c.id, authorId: c.authorId, authorName: c.authorName, authorImage: c.authorImage, text: c.text, createdAt: c.createdAt.toISOString() }))}
    />
  );
}