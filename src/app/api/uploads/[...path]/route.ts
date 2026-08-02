import { NextRequest, NextResponse } from "next/server";
import { stat, readFile } from "fs/promises";
import { join, resolve, normalize } from "path";
import { db } from "~/server/db";
import {
  extractDrivePath,
  getOneDriveFileBuffer,
} from "@/server/lib/oneDriveClient";

const UPLOADS_ROOT = join(process.cwd(), "public", "uploads");

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
  const segments = (await params).path;

  // Check if a document, chat message, or audit file with an OneDrive URL matches this path.
  // segments already include the root folder (e.g. ["AuditTool", "Annual Internal Audit Plan", "file.pdf"])
  // so we join them directly — do NOT add an extra "AuditTool/" prefix here.
  const oneDriveUrl = `onedrive:/${segments.join("/")}`;

  const [doc, chat, auditFile, riskFile, planFile, sirtFile] = await Promise.all([
    db.document.findFirst({ where: { url: oneDriveUrl }, select: { url: true } }),
    db.chatMessage.findFirst({ where: { fileUrl: oneDriveUrl }, select: { fileUrl: true } }),
    db.auditFile.findFirst({ where: { fileUrl: oneDriveUrl }, select: { fileUrl: true } }),
    db.riskAssessmentFile.findFirst({ where: { fileUrl: oneDriveUrl }, select: { fileUrl: true } }),
    db.auditPlanFile.findFirst({ where: { fileUrl: oneDriveUrl }, select: { fileUrl: true } }),
    db.sirtFile.findFirst({ where: { fileUrl: oneDriveUrl }, select: { fileUrl: true } }),
  ]);

  const matchedOneDriveUrl =
    doc?.url ?? chat?.fileUrl ?? auditFile?.fileUrl ?? riskFile?.fileUrl ?? planFile?.fileUrl ?? sirtFile?.fileUrl;

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

  // Fallback: serve from local disk
  const requested = normalize(join(UPLOADS_ROOT, ...segments));
  if (!requested.startsWith(resolve(UPLOADS_ROOT))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const info = await stat(requested);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = await readFile(requested);
    const filename = segments.at(-1) ?? "file";
    const mime = getMime(filename);
    const isInline = /\.(pdf|png|jpe?g|gif|webp|svg)$/i.test(filename);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(info.size),
        "Content-Disposition": isInline
          ? `inline; filename="${encodeURIComponent(filename)}"`
          : `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
