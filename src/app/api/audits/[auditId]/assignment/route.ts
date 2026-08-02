import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { transcriptionFrIndicesFromRole, buildUserRolesFromJson, commFrIndicesFromRoleAndRooms } from "@/server/lib/roomRoles";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { roomRolesJson: true, frontRoomsCount: true, createdById: true },
  });

  // Admins get all FR indices for transcription access
  if (user.role === "ADMIN") {
    const allFrIndices = audit?.frontRoomsCount
      ? Array.from({ length: audit.frontRoomsCount }, (_, i) => i + 1)
      : [];
    return NextResponse.json({
      isAssigned: true,
      transcriptionFrIndices: allFrIndices,
      commFrIndices: allFrIndices,
      roles: "Admin",
    });
  }

  // AUDIT_OWNER who owns this audit gets full access (same as admin)
  if (user.role === "AUDIT_OWNER" && audit?.createdById === user.id) {
    const allFrIndices = audit?.frontRoomsCount
      ? Array.from({ length: audit.frontRoomsCount }, (_, i) => i + 1)
      : [];
    return NextResponse.json({
      isAssigned: true,
      transcriptionFrIndices: allFrIndices,
      commFrIndices: allFrIndices,
      roles: "Admin",
    });
  }

  const assignee = await db.auditAssignee.findUnique({
    where: { auditId_userId: { auditId, userId: user.id } },
  });

  if (!assignee) {
    return NextResponse.json({ isAssigned: false, transcriptionFrIndices: [], commFrIndices: [], roles: "" });
  }

  const roles = audit?.roomRolesJson
    ? buildUserRolesFromJson(audit.roomRolesJson).get(user.id) ?? assignee.role
    : assignee.role;

  return NextResponse.json({
    isAssigned: true,
    transcriptionFrIndices: transcriptionFrIndicesFromRole(roles),
    commFrIndices: commFrIndicesFromRoleAndRooms(roles, audit?.roomRolesJson),
    roles,
  });
}
