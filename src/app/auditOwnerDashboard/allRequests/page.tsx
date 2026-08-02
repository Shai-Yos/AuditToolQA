import { db } from "@/server/db";
import { requireAuditOwner } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import AllRequestsOwnerClient from "./ui";

export default async function AllRequestsOwnerPage() {
  let user;
  try {
    user = await requireAuditOwner();
  } catch {
    redirect("/login");
  }

  const [requests, allAudits] = await Promise.all([
    db.request.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        trackNumber: true,
        title: true,
        labels: true,
        isFormal: true,
        createdAt: true,
        closedAt: true,
        auditTitle: true,
        createdByName: true,
        statusName: true,
        auditId: true,
        createdById: true,
        assignees: { select: { userId: true } },
        requestStatus: { select: { color: true, order: true } },
        audit: { select: { status: true } },
      },
    }),
    db.audit.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, status: true },
    }),
  ]);

  const statusMap: Record<string, { count: number; color: string; order: number }> = {};
  for (const r of requests) {
    const color = r.requestStatus?.color ?? "#3b82f6";
    const order = r.requestStatus?.order ?? 999;
    if (!statusMap[r.statusName]) {
      statusMap[r.statusName] = { count: 0, color, order };
    }
    statusMap[r.statusName]!.count += 1;
  }

  const mappedRequests = requests.map((r) => ({
    id: r.id,
    trackNumber: r.trackNumber ?? null,
    title: r.title,
    labels: (() => { try { const p = JSON.parse(r.labels); return Array.isArray(p) ? p as string[] : []; } catch { return []; } })(),
    isFormal: r.isFormal,
    createdAt: r.createdAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    auditTitle: r.auditTitle,
    createdByName: r.createdByName,
    statusName: r.statusName,
    statusColor: r.requestStatus?.color ?? "#3b82f6",
    statusOrder: r.requestStatus?.order ?? 999,
    auditId: r.auditId,
    auditStatus: r.audit.status,
    createdById: r.createdById ?? null,
    assigneeIds: r.assignees.map((a) => a.userId),
  }));

  return (
    <AllRequestsOwnerClient
      currentUserId={user.id}
      requests={mappedRequests}
      statusMap={statusMap}
      audits={allAudits}
    />
  );
}
