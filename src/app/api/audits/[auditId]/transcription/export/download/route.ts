import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/helpers/currentUser";
import { getCachedAuditPrivilege } from "@/server/lib/userPrivilegeCache";
import { getOneDriveFileBuffer } from "@/server/lib/oneDriveClient";

function isAllowedTranscriptionDrivePath(path: string): boolean {
  return path.startsWith("/AuditTool/Audits/") && path.includes("/Chat/") && path.endsWith(".html");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await params;
  const drivePath = req.nextUrl.searchParams.get("drivePath")?.trim() ?? "";
  const fileName = req.nextUrl.searchParams.get("fileName")?.trim() || "transcription-export.html";

  if (!drivePath || !isAllowedTranscriptionDrivePath(drivePath)) {
    return NextResponse.json({ error: "Invalid drive path" }, { status: 400 });
  }

  const privilege = await getCachedAuditPrivilege(user.id, auditId);
  const isAuditOwnerOfThis =
    user.role === "AUDIT_OWNER" && privilege.createdById === user.id;

  if (user.role !== "ADMIN" && !isAuditOwnerOfThis) {
    return NextResponse.json(
      { error: "Only admins or the audit owner can download transcription export" },
      { status: 403 },
    );
  }

  const oneDriveFile = await getOneDriveFileBuffer(drivePath);
  if (!oneDriveFile) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(oneDriveFile.buffer), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": String(oneDriveFile.size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
