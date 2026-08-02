import { db } from "@/server/db";
import { requireAuditOwner } from "@/server/helpers/currentUser";
import { autoCompleteExpiredAudits } from "@/server/helpers/autoCompleteAudits";
import { redirect } from "next/navigation";
import AllAuditsOwnerClient from "./ui";

export default async function AllAuditsOwnerPage() {
  let user;
  try {
    user = await requireAuditOwner();
  } catch {
    redirect("/login");
  }

  await autoCompleteExpiredAudits();

  const myAssignments = await db.auditAssignee.findMany({
    where: { userId: user.id },
    select: { auditId: true },
  });
  const myAuditIds = new Set(myAssignments.map((a) => a.auditId));

  const audits = await db.audit.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      requests: { select: { id: true } },
      users: {
        take: 5,
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  });

  const mapped = audits.map((a) => ({
    id: a.id,
    trackId: a.trackId ?? undefined,
    title: a.title,
    status: (a.status === "DRAFT" ? "Draft" : a.status === "COMPLETED" ? "Completed" : "Active") as
      | "Draft"
      | "Active"
      | "Completed",
    startDate: a.startAt?.toISOString() ?? a.createdAt.toISOString(),
    endDate: a.endAt?.toISOString() ?? null,
    roomsCount: Math.max(a.frontRoomsCount, a.backRoomsCount),
    usersCount: a.users.length,
    requestsCount: a.requests.length,
    createdByName: a.createdByName || "",
    isAssigned: myAuditIds.has(a.id),
    isOwned: a.createdById === user.id,
    assignees: a.users.map((u) => ({
      name: u.user?.name ?? u.user?.email ?? u.userId,
      image: u.user?.image ?? null,
    })),
  }));

  // Sort: Active → Draft → Completed
  const priority = { Active: 0, Draft: 1, Completed: 2 } as const;
  mapped.sort((a, b) => priority[a.status] - priority[b.status]);

  return <AllAuditsOwnerClient audits={mapped} />;
}
