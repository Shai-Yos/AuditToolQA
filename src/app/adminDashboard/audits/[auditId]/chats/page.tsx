import { notFound } from "next/navigation";
import { db } from "~/server/db";
import { requireAdmin } from "~/server/helpers/currentUser";
import { frToBrConnectionsFromJson, roleForChannel } from "~/server/lib/roomRoles";
import ChatsUI from "./ui";

export default async function Page({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const currentUser = await requireAdmin();

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      title: true,
      frontRoomsCount: true,
      roomRolesJson: true,
      requestStatuses: { select: { id: true, name: true, color: true, order: true } },
      requests: { select: { requestStatusId: true } },
    },
  });

  if (!audit) return notFound();

  const frCount = audit.frontRoomsCount;
  const frToBr = frToBrConnectionsFromJson(audit.roomRolesJson ?? null);
  const channels = [
    ...Array.from({ length: frCount }, (_, i) => i + 1)
      .filter((frIdx) => (frToBr[frIdx]?.length ?? 0) > 0)
      .map((frIdx) => `fr${frIdx}-comm`),
    ...Array.from({ length: frCount }, (_, i) => `fr${i + 1}-transcription`),
  ];

  const allMessages = await db.chatMessage.findMany({
    where: { auditId, channel: { in: channels } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  // Look up current user images & audit roles
  const authorIds = [...new Set(allMessages.map((m) => m.authorId))];
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

  const chatChannels: Record<
    string,
    Array<{ id: string; authorName: string; authorImage?: string; authorRole?: string; time: string; text: string; fileUrl?: string; fileName?: string; fileMime?: string; fileSize?: number; editedAt?: string | null }>
  > = {};
  for (const ch of channels) chatChannels[ch] = [];
  for (const m of allMessages) {
    const liveUser = userMap.get(m.authorId);
    const liveAssignee = assigneeMap.get(m.authorId);
    const liveRole = liveAssignee
      ? roleForChannel(liveAssignee.role, m.channel)
      : m.authorRole;
    chatChannels[m.channel]?.push({
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
    });
  }

  // Admins can see all transcription panels
  const transcriptionFrIndices = Array.from({ length: frCount }, (_, i) => i + 1);

  // Build FR→BR connection map from roomRolesJson
  const frToBrMap = frToBrConnectionsFromJson(audit.roomRolesJson);

  // Fetch all @mentionable users: only users assigned to this audit
  const assigneeRecords = await db.auditAssignee.findMany({
    where: { auditId },
    select: { userId: true },
  });
  const assigneeIds = assigneeRecords.map((a) => a.userId);
  const allAssigneeUsers = assigneeIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true, email: true, image: true },
      })
    : [];
  const roomUsers = allAssigneeUsers
    .filter((u) => u.id !== currentUser.id)
    .map((u) => ({ id: u.id, name: u.name ?? u.email ?? "Unknown", image: u.image ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const statusBanner = audit.requestStatuses
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((col) => ({
      id: col.id,
      name: col.name,
      color: col.color,
      count: audit.requests.filter((r) => r.requestStatusId === col.id).length,
    }));

  return (
    <ChatsUI
      auditId={audit.id}
      auditTitle={audit.title}
      frontRoomsCount={frCount}
      chatChannels={chatChannels}
      transcriptionFrIndices={transcriptionFrIndices}
      frToBrMap={frToBrMap}
      statusBanner={statusBanner}
      totalRequests={audit.requests.length}
      currentUser={{
        id: currentUser.id,
        name: currentUser.name ?? currentUser.email ?? "Admin",
        isAdmin: true,
      }}
      roomUsers={roomUsers}
    />
  );
}
