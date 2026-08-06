import { requireUser } from "@/server/helpers/currentUser";
import { db } from "@/server/db";
import UserDashboardClient from "./ui";

export default async function DashboardPage() {
  const user = await requireUser();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // IDs of audits this user is assigned to
  const myAssignments = await db.auditAssignee.findMany({
    where: { userId: user.id },
    select: { auditId: true },
  });
  const myAuditIds = new Set(myAssignments.map((a) => a.auditId));

  const allAudits = await db.audit.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ endAt: null }, { endAt: { gte: today } }],
    },
    include: {
      _count: { select: { requests: true } },
      users: {
        take: 5,
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const audits = allAudits.map((audit) => ({
    id: audit.id,
    trackId: audit.trackId ?? undefined,
    title: audit.title,
    startDate: audit.startAt?.toISOString() ?? audit.createdAt.toISOString(),
    endDate: audit.endAt?.toISOString() ?? null,
    timezone: audit.timezone ?? undefined,
    roomsCount: Math.max(audit.frontRoomsCount, audit.backRoomsCount),
    usersCount: audit.users.length,
    requestsCount: audit._count.requests,
    createdByName: audit.createdByName || "",
    isAssigned: myAuditIds.has(audit.id),
    assignees: audit.users.map((u) => ({
      name: u.user?.name ?? u.user?.email ?? u.userId,
      image: u.user?.image ?? null,
    })),
  }));

  return (
    <UserDashboardClient
      user={{
        name: user.name ?? user.email ?? "User",
        role: user.role,
        image: user.image ?? undefined,
      }}
      audits={audits}
    />
  );
}
