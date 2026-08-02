import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { requireUser } from "~/server/helpers/currentUser";
import { getOneDriveWebUrl } from "@/server/lib/oneDriveClient";

type LibraryType = "audit-plan" | "risk-assessment" | "sirt" | "audit-file";

/**
 * GET /api/onedrive/open-url?fileId=...&type=audit-plan|risk-assessment|sirt
 *
 * Returns the Office Online webUrl for a file stored in OneDrive.
 * The caller can open this URL in a new tab to co-author in the browser.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId");
  const type = searchParams.get("type") as LibraryType | null;

  if (!fileId || !type) {
    return NextResponse.json({ error: "Missing fileId or type" }, { status: 400 });
  }

  // Look up the file in the correct table to get its OneDrive path
  let fileUrl: string | null = null;

  if (type === "audit-plan") {
    const row = await db.auditPlanFile.findFirst({
      where: { id: fileId },
      select: { fileUrl: true },
    });
    fileUrl = row?.fileUrl ?? null;
  } else if (type === "risk-assessment") {
    const row = await db.riskAssessmentFile.findFirst({
      where: { id: fileId },
      select: { fileUrl: true },
    });
    fileUrl = row?.fileUrl ?? null;
  } else if (type === "sirt") {
    const row = await db.sirtFile.findFirst({
      where: { id: fileId },
      select: { fileUrl: true },
    });
    fileUrl = row?.fileUrl ?? null;
  } else if (type === "audit-file") {
    const row = await db.auditFile.findFirst({
      where: { id: fileId },
      select: { fileUrl: true },
    });
    fileUrl = row?.fileUrl ?? null;
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  if (!fileUrl) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Only OneDrive files can be opened in Office Online
  if (!fileUrl.startsWith("onedrive:")) {
    return NextResponse.json(
      { error: "File is stored locally and cannot be opened in Office Online. Re-upload with OneDrive configured." },
      { status: 422 },
    );
  }

  // Strip the "onedrive:" prefix to get the drive path
  const drivePath = fileUrl.slice("onedrive:".length);

  const webUrl = await getOneDriveWebUrl(drivePath);

  if (!webUrl) {
    return NextResponse.json(
      { error: "Could not retrieve Office Online URL from OneDrive" },
      { status: 502 },
    );
  }

  // Append ?action=default so SharePoint opens in edit mode (not read-only view).
  // Permissions are managed directly in OneDrive.
  const editUrl = webUrl.includes("?") ? `${webUrl}&action=default` : `${webUrl}?action=default`;

  return NextResponse.json({ webUrl: editUrl });
}
