import { notFound } from "next/navigation";
import { db } from "~/server/db";
import { requireAdmin } from "~/server/helpers/currentUser";
import { roleForChannel } from "~/server/lib/roomRoles";
import PopoutUI from "./ui";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { auditId } = await params;
  const { channel } = await searchParams;
  if (!channel) return notFound();

  const currentUser = await requireAdmin();

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { id: true, title: true },
  });
  if (!audit) return notFound();

  const messages = await db.chatMessage.findMany({
    where: { auditId, channel },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  const authorIds = [...new Set(messages.map((m) => m.authorId))];
  const [users, assignees] = await Promise.all([
    db.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, image: true, name: true, role: true },
    }),
    db.auditAssignee.findMany({
      where: { auditId, userId: { in: authorIds } },
      select: { userId: true, role: true },
    }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const assigneeMap = new Map(assignees.map((a) => [a.userId, a]));

  const initialMessages = messages.map((m) => {
    const liveUser = userMap.get(m.authorId);
    const liveAssignee = assigneeMap.get(m.authorId);
    const liveRole = liveUser?.role === "ADMIN"
      ? "Admin"
      : liveAssignee
          ? roleForChannel(liveAssignee.role, channel)
          : m.authorRole;
    return {
      id: m.id,
      authorName: liveUser?.name ?? m.authorName,
      authorImage: liveUser?.image ?? m.authorImage ?? undefined,
      authorRole: liveRole ?? m.authorRole ?? undefined,
      time: m.createdAt.toISOString(),
      text: m.text,
      fileUrl: m.fileUrl
        ? m.fileUrl.startsWith("onedrive:/AuditTool/")
          ? `/api/uploads/${m.fileUrl.replace("onedrive:/AuditTool/", "")}`
          : m.fileUrl
        : undefined,
      fileName: m.fileName ?? undefined,
      fileMime: m.fileMime ?? undefined,
      fileSize: m.fileSize ?? undefined,
      editedAt: m.editedAt?.toISOString() ?? null,
    };
  });

  const isTranscription = channel.endsWith("-transcription");
  const frNum = parseInt(/fr(\d+)/.exec(channel)?.[1] ?? "1", 10);
  const title = isTranscription
    ? `FR${frNum} Transcription`
    : `FR${frNum} \u2194 BR Communication`;
  const badge = isTranscription ? `FR ${frNum}` : `Room ${frNum}`;

  return (
    <PopoutUI
      auditId={auditId}
      auditTitle={audit.title}
      channel={channel}
      title={title}
      badge={badge}
      initialMessages={initialMessages}
      composerPlaceholder={isTranscription ? "Enter transcription..." : "Type a message..."}
      currentUserName={currentUser.name ?? currentUser.email ?? "Admin"}
      rightPanel={isTranscription}
      frIndex={frNum}
    />
  );
}
