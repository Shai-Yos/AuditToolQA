import { notFound } from "next/navigation";
import { db } from "~/server/db";
import { requireUser } from "~/server/helpers/currentUser";
import { buildUserRolesFromJson } from "~/server/lib/roomRoles";
import UserAuditDashboardUI from "./ui";

export default async function AuditDashboardPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const currentUser = await requireUser();

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    include: {
      _count: { select: { requests: true } },
      auditFiles: {
        orderBy: { createdAt: "asc" },
        select: { id: true, slot: true, fileUrl: true, fileName: true, createdAt: true },
      },
      requests: {
        select: {
          id: true,
          statusName: true,
          createdAt: true,
          closedAt: true,
          requestStatus: { select: { color: true, order: true } },
          assignees: { where: { userId: currentUser.id }, select: { userId: true } },
        },
      },
    },
  });

  if (!audit) return notFound();

  const assigneeRecord = await db.auditAssignee.findFirst({
    where: { auditId, userId: currentUser.id },
  });

  const isOwnerOfAudit = audit.createdById === currentUser.id;
  const effectiveRoleString = audit.roomRolesJson
    ? buildUserRolesFromJson(audit.roomRolesJson).get(currentUser.id) ?? assigneeRecord?.role ?? ""
    : assigneeRecord?.role ?? "";
  const canCreateRequest =
    isOwnerOfAudit ||
    /\bFR\d+\s+(Lead|QM)\b/i.test(effectiveRoleString) ||
    /\bBR\d+\s+(Lead|QM)\b/i.test(effectiveRoleString);

  // Status breakdown
  const statusMap = new Map<string, { count: number; color: string; order: number }>();
  for (const r of audit.requests) {
    const key = r.statusName || "—";
    const prev = statusMap.get(key);
    if (prev) prev.count++;
    else
      statusMap.set(key, {
        count: 1,
        color: r.requestStatus?.color ?? "#3b82f6",
        order: r.requestStatus?.order ?? 999,
      });
  }
  const statusBreakdown = Array.from(statusMap.entries())
    .map(([name, v]) => ({ name, count: v.count, color: v.color, order: v.order }))
    .sort((a, b) => a.order - b.order);

  // My assigned requests count
  const myAssignedCount = audit.requests.filter((r) => r.assignees.length > 0).length;

  // Average time requests are open (closed requests use closedAt; open use now)
  const nowMs = Date.now();
  const avgOpenMs =
    audit.requests.length === 0
      ? 0
      : audit.requests.reduce((sum, r) => {
          const end = r.closedAt ? r.closedAt.getTime() : nowMs;
          return sum + Math.max(0, end - r.createdAt.getTime());
        }, 0) / audit.requests.length;

  // Activity log
  const requestIds = audit.requests.map((r) => r.id);
  const activityRows = await db.activityLog.findMany({
    where: {
      OR: [
        { targetId: auditId },
        ...(requestIds.length ? [{ targetId: { in: requestIds } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const resolveUrl = (url: string) =>
    url.startsWith("onedrive:")
      ? `/api/uploads/${url.replace("onedrive:/AuditTool/", "")}`
      : url;

  const mapAuditFile = (f: { id: string; fileName: string; fileUrl: string; createdAt: Date }) => {
    const isFolder = f.fileUrl.startsWith("folder:");
    return {
      id: f.id,
      kind: isFolder ? ("folder" as const) : ("file" as const),
      fileName: f.fileName,
      fileUrl: isFolder ? null : resolveUrl(f.fileUrl),
      createdAt: f.createdAt.toISOString(),
    };
  };

  const lockActive =
    !!audit.lockedBy &&
    !!audit.lockedAt &&
    Date.now() - audit.lockedAt.getTime() < 30_000;

  return (
    <UserAuditDashboardUI
      isAdmin={isOwnerOfAudit}
      canCreateRequest={canCreateRequest}
      audit={{
        id: audit.id,
        trackId: audit.trackId ?? null,
        title: audit.title,
        description: audit.description ?? null,
        status: audit.status,
        startDate: audit.startAt?.toISOString() ?? null,
        endDate: audit.endAt?.toISOString() ?? null,
        createdByName: audit.createdByName,
        updatedAt: audit.updatedAt.toISOString(),
        outlookEventId: audit.outlookEventId ?? null,
        lockedByName: lockActive ? audit.lockedByName ?? null : null,
        requestsCount: audit._count.requests,
        myAssignedCount,
        avgOpenMs,
        statusBreakdown,
        agendaFiles: audit.auditFiles
          .filter((f) => f.slot === "agenda")
          .map(mapAuditFile),
        readyBoxFiles: audit.auditFiles
          .filter((f) => f.slot === "readyBox")
          .map(mapAuditFile),
        auditorFiles: audit.auditFiles
          .filter((f) => f.slot === "auditors")
          .map(mapAuditFile),
        activity: activityRows.map((a) => ({
          id: a.id,
          action: a.action,
          actorName: a.actorName,
          targetTitle: a.targetTitle,
          createdAt: a.createdAt.toISOString(),
          meta: a.meta,
        })),
      }}
    />
  );
}

