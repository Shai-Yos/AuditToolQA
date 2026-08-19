import { notFound } from "next/navigation";
import { db } from "~/server/db";
import { requireUser } from "~/server/helpers/currentUser";
import { frToBrConnectionsFromJson, roleForChannel, buildUserRolesFromJson, commFrIndicesFromRoleAndRooms, transcriptionFrIndicesFromRole } from "~/server/lib/roomRoles";
import ChatsUI from "@/app/userDashboard/audits/[auditId]/chats/ui";

export default async function AuditOwnerChatsPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const currentUser = await requireUser();

  // Audit owners can access any audit regardless of status (layout enforces AUDIT_OWNER role)
  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      title: true,
      frontRoomsCount: true,
      roomRolesJson: true,
      createdById: true,
      requestStatuses: { select: { id: true, name: true, color: true, order: true } },
      requests: { select: { requestStatusId: true } },
      users: { where: { userId: currentUser.id }, select: { role: true } },
    },
  });

  if (!audit) return notFound();

  const isOwner = audit.createdById === currentUser.id;

  const frCount = audit.frontRoomsCount;
  const frToBr = frToBrConnectionsFromJson(audit.roomRolesJson ?? null);
  const allChannels = [
    ...Array.from({ length: frCount }, (_, i) => i + 1)
      .filter((frIdx) => (frToBr[frIdx]?.length ?? 0) > 0)
      .map((frIdx) => `fr${frIdx}-comm`),
    ...Array.from({ length: frCount }, (_, i) => `fr${i + 1}-transcription`),
  ];

  const allMessages = await db.chatMessage.findMany({
    where: { auditId, channel: { in: allChannels } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

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

  const chatChannels: Record<string, Array<{
    id: string; authorName: string; authorImage?: string; authorRole?: string;
    time: string; text: string; fileUrl?: string; fileName?: string;
    fileMime?: string; fileSize?: number; editedAt?: string | null;
  }>> = {};
  for (const ch of allChannels) chatChannels[ch] = [];
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

  // Determine accessible channels
  const assigneeRecord = audit.users[0];
  const mappedRoleString = audit.roomRolesJson
    ? buildUserRolesFromJson(audit.roomRolesJson).get(currentUser.id) ?? ""
    : "";
  const effectiveRoleString = mappedRoleString || assigneeRecord?.role || "";

  let transcriptionFrIndices: number[];
  let commFrIndices: number[];

  if (isOwner) {
    // Owner: all channels
    transcriptionFrIndices = Array.from({ length: frCount }, (_, i) => i + 1);
    commFrIndices = Array.from({ length: frCount }, (_, i) => i + 1);
  } else if (assigneeRecord) {
    transcriptionFrIndices = transcriptionFrIndicesFromRole(effectiveRoleString);
    commFrIndices = commFrIndicesFromRoleAndRooms(effectiveRoleString, audit.roomRolesJson ?? null);
  } else {
    transcriptionFrIndices = [];
    commFrIndices = [];
  }

  const frToBrMap = frToBrConnectionsFromJson(audit.roomRolesJson ?? null);

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
      auditId={auditId}
      auditTitle={audit.title}
      frontRoomsCount={frCount}
      chatChannels={chatChannels}
      transcriptionFrIndices={transcriptionFrIndices}
      commFrIndices={commFrIndices}
      frToBrMap={frToBrMap}
      roomUsers={roomUsers}
      statusBanner={statusBanner}
      totalRequests={audit.requests.length}
      currentUser={{
        id: currentUser.id,
        name: currentUser.name ?? currentUser.email ?? "Audit Owner",
        isAdmin: isOwner,
        roles: effectiveRoleString,
      }}
      isAssignedToAudit={isOwner || !!assigneeRecord}
    />
  );
}
