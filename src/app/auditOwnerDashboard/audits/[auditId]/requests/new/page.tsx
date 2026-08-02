import { db } from "~/server/db";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "~/server/helpers/currentUser";
import { buildUserRolesFromJson } from "~/server/lib/roomRoles";
import CreateRequestUI from "@/app/userDashboard/audits/[auditId]/requests/new/ui";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { auditId } = await params;
  const { tab } = await searchParams;

  const currentUser = await requireUser();

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      title: true,
      frontRoomsCount: true,
      roomRolesJson: true,
      createdById: true,
      requestStatuses: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true } },
    },
  });

  if (!audit) return notFound();

  const isOwner = audit.createdById === currentUser.id;

  // Owners can always create; otherwise check FR/BR Lead or QM role
  if (!isOwner) {
    const userRoleString = audit.roomRolesJson
      ? buildUserRolesFromJson(audit.roomRolesJson).get(currentUser.id) ?? ""
      : "";
    const canCreate = /\bFR\d+\s+(Lead|QM)\b/i.test(userRoleString) || /\bBR\d+\s+(Lead|QM)\b/i.test(userRoleString);
    if (!canCreate) redirect(`/auditOwnerDashboard/audits/${auditId}`);
  }

  return (
    <CreateRequestUI
      auditId={audit.id}
      auditTitle={audit.title}
      defaultStatusColumnId={audit.requestStatuses[0]?.id ?? null}
      returnTab={tab ?? "requests"}
      frontRoomsCount={audit.frontRoomsCount}
      dashboardBase="/auditOwnerDashboard"
    />
  );
}
