import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { requireUser } from "~/server/helpers/currentUser";
import {
  extractDrivePath,
  getOneDriveFileBuffer,
} from "@/server/lib/oneDriveClient";

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

function getMime(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const segments = (await params).path;

  // Support both URL shapes:
  // 1. Canonical paths that include the OneDrive root folder in the browser URL
  //    (e.g. /api/uploads/AuditTool/Annual Internal Audit Plan/file.docx)
  // 2. Legacy audit/chat paths that omit the root folder in the browser URL
  //    (e.g. /api/uploads/Audits/<audit>/General/file.docx)
  const joinedPath = segments.join("/");
  const oneDriveUrls = segments[0] === "AuditTool"
    ? [`onedrive:/${joinedPath}`]
    : [`onedrive:/AuditTool/${joinedPath}`, `onedrive:/${joinedPath}`];

  const [doc, chat, auditFile, riskFile, planFile, sirtFile, regulatoryFile, miscFile] = await Promise.all([
    db.document.findFirst({ where: { url: { in: oneDriveUrls } }, select: { url: true } }),
    db.chatMessage.findFirst({ where: { fileUrl: { in: oneDriveUrls } }, select: { fileUrl: true } }),
    db.auditFile.findFirst({ where: { fileUrl: { in: oneDriveUrls } }, select: { fileUrl: true } }),
    db.riskAssessmentFile.findFirst({ where: { fileUrl: { in: oneDriveUrls } }, select: { fileUrl: true } }),
    db.auditPlanFile.findFirst({ where: { fileUrl: { in: oneDriveUrls } }, select: { fileUrl: true } }),
    db.sirtFile.findFirst({ where: { fileUrl: { in: oneDriveUrls } }, select: { fileUrl: true } }),
    db.regulatoryImplementationFile.findFirst({ where: { fileUrl: { in: oneDriveUrls } }, select: { fileUrl: true } }),
    db.miscellaneousFile.findFirst({ where: { fileUrl: { in: oneDriveUrls } }, select: { fileUrl: true } }),
  ]);

  const matchedOneDriveUrl =
    doc?.url ??
    chat?.fileUrl ??
    auditFile?.fileUrl ??
    riskFile?.fileUrl ??
    planFile?.fileUrl ??
    sirtFile?.fileUrl ??
    regulatoryFile?.fileUrl ??
    miscFile?.fileUrl;

  if (matchedOneDriveUrl) {
    const drivePath = extractDrivePath(matchedOneDriveUrl);
    const filename = segments.at(-1) ?? "file";
    const mime = getMime(filename);

    // Stream through server (avoids SharePoint Conditional Access issues on redirect)
    const fileData = await getOneDriveFileBuffer(drivePath);
    if (fileData) {
      const isInline = /\.(pdf|png|jpe?g|gif|webp|svg)$/i.test(filename);
      return new NextResponse(new Uint8Array(fileData.buffer), {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(fileData.size),
          "Content-Disposition": isInline
            ? `inline; filename="${encodeURIComponent(filename)}"`
            : `attachment; filename="${encodeURIComponent(filename)}"`,
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
