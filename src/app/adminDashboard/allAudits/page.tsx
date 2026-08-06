import { db } from "@/server/db";
import { requireAdmin } from "@/server/helpers/currentUser";
import { autoCompleteExpiredAudits } from "@/server/helpers/autoCompleteAudits";
import { redirect } from "next/navigation";
import AllAuditsClient from "./ui";

export default async function AllAuditsPage() {
  let user;
  try {
    user = await requireAdmin();
  } catch {
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
      _count: { select: { requests: true } },
      users: {
        take: 5,
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  });

  const mappedAudits = audits.map((a) => {
    const roomsCount = Math.max(a.frontRoomsCount, a.backRoomsCount);

    const status: "Draft" | "Active" | "Completed" = a.status === "DRAFT" ? "Draft" : a.status === "COMPLETED" ? "Completed" : "Active";

    return {
      id: a.id,
      trackId: a.trackId ?? undefined,
      title: a.title,
      status,
      startDate: a.startAt?.toISOString() ?? a.createdAt.toISOString(),
      endDate: a.endAt?.toISOString() ?? null,
      roomsCount,
      usersCount: a.users.length,
      requestsCount: a._count.requests,
      createdByName: a.createdByName || "",
      isAssigned: myAuditIds.has(a.id),
      isMyAudit: a.createdById === user.id,
      assignees: a.users.map((u) => ({
        name: u.user?.name ?? u.user?.email ?? u.userId,
        image: u.user?.image ?? null,
      })),
    };
  });

  const sortedAudits = mappedAudits.sort((a, b) => {
    const priority = { Active: 0, Draft: 1, Completed: 2 };
    return priority[a.status] - priority[b.status];
  });

  return (
    <AllAuditsClient
      user={{ name: user.name ?? user.email ?? "Admin" }}
      audits={sortedAudits}
      userRole={user.role}
    />
  );
}
