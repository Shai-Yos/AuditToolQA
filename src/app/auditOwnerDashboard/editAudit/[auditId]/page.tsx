import { db } from "@/server/db";
import { redirect } from "next/navigation";
import { requireAuditOwner } from "@/server/helpers/currentUser";
import EditAuditForm from "@/app/adminDashboard/editAudit/[auditId]/ui";
import type { StepKey } from "@/components/audit-form/audit-form-shared";

export default async function AuditOwnerEditAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { auditId } = await params;
  const { step: stepParam } = await searchParams;
  const currentUser = await requireAuditOwner();

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    include: {
      requestStatuses: { orderBy: { order: "asc" } },
      users: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!audit) redirect("/auditOwnerDashboard");

  // AUDIT_OWNER can only edit their own audits that are not completed
  if (audit.createdById !== currentUser.id) redirect("/auditOwnerDashboard");
  if (audit.status === "COMPLETED") redirect("/auditOwnerDashboard");

  type FRRoleInit = { frIndex: number; leadUserIds: string[]; qmUserIds: string[]; smeUserIds?: string[]; transcriptionUserIds: string[] };
  type BRRoleInit = { brIndex: number; leadUserIds: string[]; callerUserIds: string[]; qmUserIds: string[]; qualityReviewerUserIds: string[]; smePrepUserIds: string[]; outgoingUserIds: string[]; incomingUserIds: string[]; recordsPrepUserIds: string[]; connectedFrIndices: number[] };

  const roleUserIds = new Set<string>();
  let initialFrRoles: FRRoleInit[] = [];
  let initialBrRoles: BRRoleInit[] = [];

  try {
    const parsed = audit.roomRolesJson
      ? (JSON.parse(audit.roomRolesJson) as { fr?: any[]; br?: any[] })
      : { fr: [], br: [] };

    initialFrRoles = Array.from({ length: audit.frontRoomsCount }, (_, i) => {
      const found = parsed.fr?.find((r: any) => r.frIndex === i + 1);
      const leadUserIds: string[] = Array.isArray(found?.leadUserIds) ? found.leadUserIds : [];
      const qmUserIds: string[] = Array.isArray(found?.qmUserIds) ? found.qmUserIds : [];
      const smeUserIds: string[] = Array.isArray(found?.smeUserIds) ? found.smeUserIds : [];
      const transcriptionUserIds: string[] = Array.isArray(found?.transcriptionUserIds) ? found.transcriptionUserIds : [];
      leadUserIds.forEach((id) => roleUserIds.add(id));
      qmUserIds.forEach((id) => roleUserIds.add(id));
      smeUserIds.forEach((id) => roleUserIds.add(id));
      transcriptionUserIds.forEach((id) => roleUserIds.add(id));
      return { frIndex: i + 1, leadUserIds, qmUserIds, smeUserIds, transcriptionUserIds };
    });

    initialBrRoles = Array.from({ length: audit.backRoomsCount }, (_, i) => {
      const found = parsed.br?.find((r: any) => r.brIndex === i + 1);
      const leadUserIds: string[] = Array.isArray(found?.leadUserIds) ? found.leadUserIds : [];
      const callerUserIds: string[] = Array.isArray(found?.callerUserIds) ? found.callerUserIds : [];
      const qmUserIds: string[] = Array.isArray(found?.qmUserIds) ? found.qmUserIds : [];
      const qualityReviewerUserIds: string[] = Array.isArray(found?.qualityReviewerUserIds) ? found.qualityReviewerUserIds : [];
      const smePrepUserIds: string[] = Array.isArray(found?.smePrepUserIds) ? found.smePrepUserIds : [];
      const outgoingUserIds: string[] = Array.isArray(found?.outgoingUserIds) ? found.outgoingUserIds : [];
      const incomingUserIds: string[] = Array.isArray(found?.incomingUserIds) ? found.incomingUserIds : [];
      const recordsPrepUserIds: string[] = Array.isArray(found?.recordsPrepUserIds) ? found.recordsPrepUserIds : [];
      const connectedFrIndices: number[] = Array.isArray(found?.connectedFrIndices) ? found.connectedFrIndices : [];
      [leadUserIds, callerUserIds, qmUserIds, qualityReviewerUserIds, smePrepUserIds, outgoingUserIds, incomingUserIds, recordsPrepUserIds]
        .flat().forEach((id) => roleUserIds.add(id));
      return { brIndex: i + 1, leadUserIds, callerUserIds, qmUserIds, qualityReviewerUserIds, smePrepUserIds, outgoingUserIds, incomingUserIds, recordsPrepUserIds, connectedFrIndices };
    });
  } catch {
    // malformed JSON — leave empty arrays
  }

  const roleUsers = roleUserIds.size > 0
    ? await db.user.findMany({
        where: { id: { in: Array.from(roleUserIds) } },
        select: { id: true, name: true, email: true },
      })
    : [];

  const existingUsersMap = new Map<string, { userId: string; name: string | null; email: string | null }>();
  for (const a of audit.users) {
    existingUsersMap.set(a.userId, { userId: a.userId, name: a.user?.name ?? null, email: a.user?.email ?? null });
  }
  for (const u of roleUsers) {
    existingUsersMap.set(u.id, { userId: u.id, name: u.name, email: u.email });
  }

  return (
    <EditAuditForm
      audit={{
        id: audit.id,
        title: audit.title,
        description: audit.description,
        status: audit.status as "DRAFT" | "ACTIVE" | "COMPLETED",
        startAt: audit.startAt,
        endAt: audit.endAt,
        timezone: audit.timezone ?? "UTC",
        frontRoomsCount: audit.frontRoomsCount,
        backRoomsCount: audit.backRoomsCount,
        roomRolesJson: audit.roomRolesJson,
        statusColumns: audit.requestStatuses,
        existingUsers: Array.from(existingUsersMap.values()),
        initialFrRoles,
        initialBrRoles,
        initialStep: stepParam as StepKey | undefined,
      }}
      currentUserName={currentUser.name ?? currentUser.email ?? "Audit Owner"}
    />
  );
}
