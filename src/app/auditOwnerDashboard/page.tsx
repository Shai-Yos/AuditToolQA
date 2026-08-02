import { requireAuditOwner } from "@/server/helpers/currentUser";
import { db } from "@/server/db";
import { autoCompleteExpiredAudits } from "@/server/helpers/autoCompleteAudits";
import AuditOwnerDashboardClient from "./ui";

export default async function AuditOwnerDashboardPage() {
  const user = await requireAuditOwner();

  await autoCompleteExpiredAudits();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const myAssignments = await db.auditAssignee.findMany({
    where: { userId: user.id },
    select: { auditId: true },
  });
  const assignedIds = new Set(myAssignments.map((a) => a.auditId));

  const allActiveAudits = await db.audit.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ endAt: null }, { endAt: { gte: today } }],
    },
    include: {
      requests: { select: { id: true } },
      users: {
        take: 5,
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const audits = allActiveAudits.map((a) => ({
    id: a.id,
    trackId: a.trackId ?? undefined,
    title: a.title,
    status: "Active" as const,
    startDate: a.startAt?.toISOString() ?? a.createdAt.toISOString(),
    endDate: a.endAt?.toISOString() ?? null,
    timezone: a.timezone ?? undefined,
    roomsCount: Math.max(a.frontRoomsCount, a.backRoomsCount),
    usersCount: a.users.length,
    requestsCount: a.requests.length,
    createdByName: a.createdByName || "",
    isOwned: a.createdById === user.id,
    isAssigned: assignedIds.has(a.id),
    assignees: a.users.map((u) => ({
      name: u.user?.name ?? u.user?.email ?? u.userId,
      image: u.user?.image ?? null,
    })),
  }));

  return (
    <AuditOwnerDashboardClient
      user={{ name: user.name ?? user.email ?? "Audit Owner", role: user.role, image: user.image ?? undefined }}
      audits={audits}
    />
  );
}
