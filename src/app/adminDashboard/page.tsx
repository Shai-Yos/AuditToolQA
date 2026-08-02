import { db } from "@/server/db";
import { requireAdmin } from "@/server/helpers/currentUser";
import { autoCompleteExpiredAudits } from "@/server/helpers/autoCompleteAudits";
import { redirect } from "next/navigation";
import AdminDashboardClient from "./ui";

export default async function AdminDashboardPage() {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    // User not found or not admin, redirect to login
    redirect("/login");
  }

  // Auto-complete expired audits in the DB before querying
  await autoCompleteExpiredAudits();

  // IDs of audits this admin is assigned to
  const myAssignments = await db.auditAssignee.findMany({
    where: { userId: user.id },
    select: { auditId: true },
  });
  const myAuditIds = new Set(myAssignments.map((a) => a.auditId));

  const audits = await db.audit.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      requests: true,
      users: {
        take: 5,
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  });

  const mappedAudits = audits.map((a) => {
    // Use frontRoomsCount and backRoomsCount instead of pairs
    const roomsCount = Math.max(a.frontRoomsCount, a.backRoomsCount);

    // Determine actual status directly from DB (auto-complete already ran)
    const status: "Draft" | "Active" | "Completed" = a.status === "DRAFT" ? "Draft" : a.status === "COMPLETED" ? "Completed" : "Active";

    return {
      id: a.id,
      trackId: a.trackId ?? undefined,
      title: a.title,
      status,
      startDate: a.startAt?.toISOString() ?? a.createdAt.toISOString(),
      endDate: a.endAt?.toISOString() ?? null,
      timezone: a.timezone ?? undefined,
      roomsCount,
      usersCount: a.users.length,
      requestsCount: a.requests.length,
      createdByName: a.createdByName || "",
      isAssigned: myAuditIds.has(a.id),
      isMyAudit: a.createdById === user.id,
      assignees: a.users.map((u) => ({
        name: u.user?.name ?? u.user?.email ?? u.userId,
        image: u.user?.image ?? null,
      })),
    };
  });

  // Sort audits: Active first, then Draft, then Completed
  const sortedAudits = mappedAudits.sort((a, b) => {
    const statusPriority = { Active: 0, Draft: 1, Completed: 2 };
    return statusPriority[a.status] - statusPriority[b.status];
  });

  const activeAudits = sortedAudits.filter((a) => a.status === "Active");

  const [totalAudits, totalRequests, activeAuditsCount, recentActivity] = await Promise.all([
    Promise.resolve(sortedAudits.length),
    Promise.resolve(sortedAudits.reduce((sum, a) => sum + a.requestsCount, 0)),
    Promise.resolve(activeAudits.length),
    db.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, action: true, actorName: true, targetId: true, targetTitle: true, meta: true, createdAt: true },
    }),
  ]);

  return (
    <AdminDashboardClient
      user={{
        name: user.name ?? user.email ?? "Admin",
        role: user.role,
        image: user.image ?? undefined,
      }}
      stats={{
        totalAudits,
        activeAudits: activeAuditsCount,
        totalRequests,
      }}
      audits={activeAudits}
      recentActivity={recentActivity.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}