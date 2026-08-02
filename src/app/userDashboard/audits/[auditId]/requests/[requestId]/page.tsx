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

  const [request, comments] = await Promise.all([
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
            users: {
              include: { user: { select: { id: true, name: true, email: true, image: true } } },
            },
          },
        },
      },
    }),
    db.requestComment.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!request) return notFound();

  // Also fetch admins so they can be tagged in comments
  const admins = await db.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true, image: true },
  });

  // Merge audit assignees + admins (deduplicate)
  const assigneeMap = new Map<string, { id: string; name: string; email: string | null; image: string | null }>();
  for (const a of request.audit.users) {
    if (a.user) assigneeMap.set(a.userId, { id: a.userId, name: a.user.name ?? a.user.email ?? a.userId, email: a.user.email, image: a.user.image });
  }
  for (const a of admins) {
    if (!assigneeMap.has(a.id)) assigneeMap.set(a.id, { id: a.id, name: a.name ?? a.email ?? a.id, email: a.email, image: a.image });
  }

  // Fetch Azure AD photos for all people in parallel
  const allUserIds = [...assigneeMap.keys()];
  const photoMap = new Map<string, string | null>();
  await Promise.all(
    allUserIds.map(async (userId) => {
      const photo = await getUserPhoto(userId).catch(() => null);
      photoMap.set(userId, photo);
    })
  );

  const auditPeople = [...assigneeMap.values()].map((u) => ({
    id: u.id,
    name: u.name,
    image: photoMap.get(u.id) ?? u.image ?? null,
  }));

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
      auditPeople={auditPeople}
      statusColumns={request.audit.requestStatuses.map((c) => ({ id: c.id, name: c.name }))}
      note={{ text: request.noteText ?? "", lastEditedBy: request.noteLastEditedBy ?? null, lastEditedAt: request.noteLastEditedAt?.toISOString() ?? null }}
      currentUserId={currentUser.id}
      currentUserName={currentUser.name ?? currentUser.email ?? currentUser.id}
      currentUserImage={photoMap.get(currentUser.id) ?? currentUser.image ?? null}
      comments={comments.map((c) => ({ id: c.id, authorId: c.authorId, authorName: c.authorName, authorImage: c.authorImage, text: c.text, createdAt: c.createdAt.toISOString() }))}
    />
  );
}
