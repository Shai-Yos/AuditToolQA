import { notFound } from "next/navigation";
import { db } from "~/server/db";
import { requireAdmin } from "~/server/helpers/currentUser";
import { getUserPhoto } from "~/server/lib/graphClient";
import AssigneesUI from "./ui";

export default async function Page({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const currentUser = await requireAdmin();

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      title: true,
      roomRolesJson: true,
      frontRoomsCount: true,
      users: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!audit) return notFound();

  const userInfo = new Map(
    audit.users.map((a) => [
      a.userId,
      {
        name: a.user?.name ?? a.user?.email ?? a.userId,
        image: a.user?.image ?? null,
      },
    ]),
  );

  type AssigneeEntry = { id: string; name: string; role: string; image: string | null };
  const assignees: AssigneeEntry[] = [];

  if (audit.roomRolesJson) {
    try {
      const parsed = JSON.parse(audit.roomRolesJson) as {
        fr?: Array<{ frIndex: number; leadUserIds: string[]; qmUserIds: string[]; smeUserIds?: string[]; transcriptionUserIds: string[] }>;
        br?: Array<{ brIndex: number; leadUserIds: string[]; callerUserIds: string[]; qmUserIds?: string[]; qualityReviewerUserIds: string[]; smePrepUserIds?: string[]; outgoingUserIds: string[]; incomingUserIds: string[]; recordsPrepUserIds: string[] }>;
      };

      const addEntry = (userId: string, role: string) => {
        const info = userInfo.get(userId);
        if (!info) return;
        assignees.push({ id: `${userId}::${role}`, name: info.name, role, image: info.image });
      };

      for (const fr of parsed.fr ?? []) {
        const prefix = `FR${fr.frIndex}`;
        fr.leadUserIds?.forEach((id) => addEntry(id, `${prefix} Lead`));
        fr.qmUserIds?.forEach((id) => addEntry(id, `${prefix} QM`));
        fr.smeUserIds?.forEach((id) => addEntry(id, `${prefix} SME`));
        fr.transcriptionUserIds?.forEach((id) => addEntry(id, `${prefix} Transcriptionist`));
      }
      for (const br of parsed.br ?? []) {
        const prefix = `BR${br.brIndex}`;
        br.leadUserIds?.forEach((id) => addEntry(id, `${prefix} Lead`));
        br.callerUserIds?.forEach((id) => addEntry(id, `${prefix} Caller`));
        br.qmUserIds?.forEach((id) => addEntry(id, `${prefix} QM`));
        br.qualityReviewerUserIds?.forEach((id) => addEntry(id, `${prefix} Quality Reviewer`));
        br.smePrepUserIds?.forEach((id) => addEntry(id, `${prefix} SME Prep`));
        br.outgoingUserIds?.forEach((id) => addEntry(id, `${prefix} Outgoing`));
        br.incomingUserIds?.forEach((id) => addEntry(id, `${prefix} Incoming`));
        br.recordsPrepUserIds?.forEach((id) => addEntry(id, `${prefix} Records Prep`));
      }
    } catch {
      // fallback below
    }
  }

  if (assignees.length === 0) {
    audit.users.forEach((a) => {
      assignees.push({
        id: a.userId,
        name: a.user?.name ?? a.user?.email ?? a.userId,
        role: a.role,
        image: a.user?.image ?? null,
      });
    });
  }

  // Merge same-user same-room entries into one with multiple roles
  const mergedMap = new Map<string, { id: string; name: string; roles: string[]; image: string | null }>();
  for (const a of assignees) {
    const userId = a.id.split("::")[0]!;
    const roomMatch = /^(FR\d+|BR\d+)\s/.exec(a.role);
    const key = roomMatch ? `${userId}::${roomMatch[1]}` : a.id;
    if (mergedMap.has(key)) {
      mergedMap.get(key)!.roles.push(a.role);
    } else {
      mergedMap.set(key, { id: key, name: a.name, roles: [a.role], image: a.image });
    }
  }
  const mergedAssignees = Array.from(mergedMap.values());

  // Fetch Azure AD profile photos for all unique users in parallel
  const uniqueUserIds = Array.from(new Set(mergedAssignees.map((a) => a.id.split("::")[0]!)));
  const photoMap = new Map<string, string | null>();
  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const photo = await getUserPhoto(userId).catch(() => null);
      photoMap.set(userId, photo);
    })
  );

  // Override image with Azure photo (falls back to DB image if Graph returns null)
  for (const a of mergedAssignees) {
    const userId = a.id.split("::")[0]!;
    const azurePhoto = photoMap.get(userId);
    if (azurePhoto) a.image = azurePhoto;
  }

  return (
    <AssigneesUI
      audit={{ id: audit.id, title: audit.title, users: mergedAssignees, frontRoomsCount: audit.frontRoomsCount }}
      currentUser={{ id: currentUser.id, name: currentUser.name ?? currentUser.email ?? "Admin", isAdmin: true }}
    />
  );
}