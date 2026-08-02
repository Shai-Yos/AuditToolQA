import { db } from "@/server/db";
import { requireAdmin } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import AuditRequestsClient from "./ui";

export default async function AuditRequestsPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  let user;
  try {
    user = await requireAdmin();
  } catch {
    redirect("/login");
  }

  const [audit, requests] = await Promise.all([
    db.audit.findUnique({ where: { id: auditId }, select: { title: true, frontRoomsCount: true } }),
    db.request.findMany({
      where: { auditId },
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
        createdById: true,
        statusName: true,
        auditId: true,
        requestStatus: { select: { color: true, order: true } },
        assignees: { select: { userId: true } },
        estimatedDeliveryDate: true,
      },
    }),
  ]);

  if (!audit) redirect("/adminDashboard");

  // Build status → { count, color, order } map
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
    createdById: r.createdById ?? null,
    statusName: r.statusName,
    statusColor: r.requestStatus?.color ?? "#3b82f6",
    statusOrder: r.requestStatus?.order ?? 999,
    auditId: r.auditId,
    assigneeIds: r.assignees.map((a) => a.userId),
    estimatedDeliveryDate: r.estimatedDeliveryDate ? r.estimatedDeliveryDate.toISOString().split("T")[0]! : null,
  }));

  return (
    <AuditRequestsClient
      user={{ name: user.name ?? user.email ?? "Admin" }}
      currentUserId={user.id}
      auditId={auditId}
      auditTitle={audit.title}
      frontRoomsCount={audit.frontRoomsCount}
      requests={mappedRequests}
      statusMap={statusMap}
    />
  );
}
