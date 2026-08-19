import { notFound } from "next/navigation";
import { db } from "~/server/db";
import { requireUser } from "~/server/helpers/currentUser";
import { getUserPhoto } from "~/server/lib/graphClient";
import { buildUserRolesFromJson } from "~/server/lib/roomRoles";
import KanbanBoardUI from "@/app/userDashboard/audits/[auditId]/kanbanBoard/ui";

export default async function AuditOwnerKanbanPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const currentUser = await requireUser();

  // Audit owners can access any audit regardless of status (layout enforces AUDIT_OWNER role)
  const audit = await db.audit.findUnique({
    where: { id: auditId },
    include: {
      requestStatuses: { orderBy: { order: "asc" } },
      requests: {
        include: {
          requestStatus: { select: { name: true } },
          documents: { select: { id: true } },
          createdBy: { select: { name: true, email: true, image: true } },
          assignees: { select: { userId: true, assigneeName: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!audit) return notFound();

  const isOwner = audit.createdById === currentUser.id;

  const allAssigneeIds = Array.from(
    new Set(audit.requests.flatMap((r) => r.assignees.map((a) => a.userId)))
  );
  const photoMap = new Map<string, string | null>();
  if (isOwner) {
    await Promise.all(
      allAssigneeIds.map(async (userId) => {
        photoMap.set(userId, await getUserPhoto(userId).catch(() => null));
      })
    );
  }

  const roomLabel = `${audit.frontRoomsCount} FR · ${audit.backRoomsCount} BR`;

  const userRoleString = audit.roomRolesJson
    ? buildUserRolesFromJson(audit.roomRolesJson).get(currentUser.id) ?? ""
    : "";

  return (
    <KanbanBoardUI
      audit={{
        id: audit.id,
        title: audit.title,
        roomLabel,
        frontRoomsCount: audit.frontRoomsCount,
        statusColumns: audit.requestStatuses.map((c) => ({
          id: c.id,
          name: c.name,
          order: c.order,
          color: c.color,
        })),
        requests: audit.requests.map((r) => ({
          id: r.id,
          title: r.title,
          trackNumber: r.trackNumber ?? null,
          labels: (() => { try { const p = JSON.parse(r.labels); return Array.isArray(p) ? p as string[] : []; } catch { return []; } })(),
          statusColumnId: r.requestStatusId,
          statusName: r.requestStatus.name,
          isFormal: r.isFormal,
          code: null,
          createdAt: r.createdAt.toISOString(),
          documentsCount: r.documents.length,
          commentsCount: r._count.comments,
          creatorId: r.createdById ?? null,
          creatorName: r.createdBy?.name ?? r.createdBy?.email ?? null,
          creatorImage: r.createdBy?.image ?? null,
          estimatedDeliveryDate: r.estimatedDeliveryDate ? r.estimatedDeliveryDate.toISOString().split("T")[0]! : null,
          assignees: r.assignees.map((a) => ({
            id: a.userId,
            name: a.assigneeName || a.userId,
            image: photoMap.get(a.userId) ?? null,
          })),
        })),
      }}
      currentUser={{ id: currentUser.id, name: currentUser.name ?? currentUser.email ?? "Audit Owner", isAdmin: isOwner, roles: userRoleString }}
      dashboardBase="/auditOwnerDashboard"
    />
  );
}
