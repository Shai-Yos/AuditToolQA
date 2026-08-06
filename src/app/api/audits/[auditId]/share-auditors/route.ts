import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { requireAdmin } from "~/server/helpers/currentUser";
import { type SharePermissionLevel, shareOneDriveFolder } from "@/server/lib/oneDriveClient";

const VALID_PERMISSION_LEVELS: SharePermissionLevel[] = ["view", "edit"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await params;

  const body = (await req.json()) as { emails?: unknown; message?: unknown; permissionLevel?: unknown };
  const emails = Array.isArray(body.emails)
    ? (body.emails as unknown[]).filter((e): e is string => typeof e === "string" && e.includes("@"))
    : [];
  const permissionLevel: SharePermissionLevel =
    typeof body.permissionLevel === "string" && VALID_PERMISSION_LEVELS.includes(body.permissionLevel as SharePermissionLevel)
      ? (body.permissionLevel as SharePermissionLevel)
      : "view";

  if (emails.length === 0) {
    return NextResponse.json({ error: "No valid email addresses provided" }, { status: 400 });
  }

  const audit = await db.audit.findUnique({ where: { id: auditId }, select: { title: true } });
  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const safeTitle = audit.title.replace(/[^a-zA-Z0-9._\- ]/g, "_");
  const drivePath = `/AuditTool/Audits/${safeTitle}/Auditors`;

  const message = typeof body.message === "string" && body.message.trim()
    ? body.message.trim()
    : `You have been invited to access the Auditors folder for audit: "${audit.title}".`;

  try {
    const result = await shareOneDriveFolder(drivePath, emails, message, permissionLevel);
    const hasAnySuccess = result.succeeded.length > 0;
    if (!hasAnySuccess && result.failed.length > 0) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[share-auditors] Unexpected error:", err);
    return NextResponse.json(
      {
        succeeded: [],
        failed: emails,
        error: err instanceof Error ? err.message : "Failed to share auditors folder",
      },
      { status: 500 },
    );
  }
}
