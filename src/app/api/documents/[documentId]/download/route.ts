import { NextRequest, NextResponse } from "next/server";
import { join, normalize, resolve } from "path";
import { stat, readFile } from "fs/promises";
import { db } from "~/server/db";
import {
  isOneDriveUrl,
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

/**
 * GET /api/documents/[documentId]/download
 * Handles downloading documents regardless of storage backend (OneDrive or local).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  const document = await db.document.findUnique({
    where: { id: documentId },
    select: { url: true, filename: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // If stored on OneDrive, stream through server (avoids SharePoint Conditional Access issues)
  if (isOneDriveUrl(document.url)) {
    const drivePath = extractDrivePath(document.url);

    const fileData = await getOneDriveFileBuffer(drivePath);
    if (fileData) {
      const mime = getMime(document.filename);
      return new NextResponse(new Uint8Array(fileData.buffer), {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(fileData.size),
          "Content-Disposition": `attachment; filename="${encodeURIComponent(document.filename)}"`,
          "Cache-Control": "private, max-age=86400",
        },
      });
    }

    return NextResponse.json({ error: "File not available" }, { status: 404 });
  }

  // For local files: serve from disk directly to avoid redirect-to-localhost issues behind reverse proxy
  const relativePath = document.url
    .replace(/^\/api\/uploads\//, "")
    .split("/")
    .map(decodeURIComponent);
  const filepath = normalize(join(UPLOADS_ROOT, ...relativePath));

  // Path traversal guard
  if (!filepath.startsWith(resolve(UPLOADS_ROOT))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const info = await stat(filepath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const buffer = await readFile(filepath);
    const mime = getMime(document.filename);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(info.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.filename)}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
