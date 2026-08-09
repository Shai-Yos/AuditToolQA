import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import JSZip from "jszip";
import { db } from "~/server/db";
import { requireUser } from "~/server/helpers/currentUser";
import {
  extractDrivePath,
  getOneDriveFileBuffer,
  isOneDriveUrl,
  readLocalFile,
} from "@/server/lib/oneDriveClient";

const ALLOWED_SLOTS = ["agenda", "readyBox"] as const;
type Slot = (typeof ALLOWED_SLOTS)[number];

const slugify = (s: string, fallback: string) =>
  s
    .trim()
    .replace(/[\/\\:*?"<>|]/g, "_")
    .substring(0, 100) || fallback;

const slotFolderName = (slot: Slot) =>
  slot === "agenda" ? "General" : "Ready Box";

function sanitiseFolderPath(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

// GET /api/audits/[auditId]/files/download-zip?slot=agenda|readyBox&path=optional/subfolder
//
// Builds a zip on the fly containing every file inside the requested slot
// (optionally narrowed to a sub-folder path). The zip preserves the original
// folder structure relative to the requested path.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await params;
  const url = new URL(request.url);
  const slot = url.searchParams.get("slot") ?? "";
  const folderPath = sanitiseFolderPath(url.searchParams.get("path"));

  if (!ALLOWED_SLOTS.includes(slot as Slot)) {
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  }

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { title: true, trackId: true },
  });
  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  // Pull every file row for the slot, then filter to those inside the target
  // folder. Folder placeholder rows (fileUrl starts with "folder:") are
  // ignored — empty folders simply do not appear in the zip.
  const rows = await db.auditFile.findMany({
    where: { auditId, slot },
    select: { fileName: true, fileUrl: true },
  });

  const prefix = folderPath ? `${folderPath}/` : "";
  const filesInScope = rows.filter(
    (r) =>
      !r.fileUrl.startsWith("folder:") &&
      (prefix === "" || r.fileName.startsWith(prefix)),
  );

  if (filesInScope.length === 0) {
    return NextResponse.json(
      { error: "No files to download" },
      { status: 404 },
    );
  }

  const auditSlug = slugify(audit.trackId ? `${audit.trackId} ${audit.title}` : audit.title, auditId);
  const slotFolder = slotFolderName(slot as Slot);

  const zip = new JSZip();
  let added = 0;

  for (const row of filesInScope) {
    // Path inside the zip is the file path relative to the requested folder
    const relPath = prefix ? row.fileName.slice(prefix.length) : row.fileName;
    if (!relPath) continue;

    let buffer: Buffer | null = null;

    if (isOneDriveUrl(row.fileUrl)) {
      const drivePath = extractDrivePath(row.fileUrl);
      const fetched = await getOneDriveFileBuffer(drivePath);
      buffer = fetched?.buffer ?? null;
    } else if (row.fileUrl.startsWith("/api/uploads/")) {
      const relative = row.fileUrl.replace(/^\/api\/uploads\//, "");
      const localPath = join(process.cwd(), "public", "uploads", relative);
      buffer = await readLocalFile(localPath);
    }

    // Last-resort fallback: try the canonical local path derived from the row
    if (!buffer) {
      const segments = row.fileName.split("/").filter(Boolean);
      const localPath = join(
        process.cwd(),
        "public",
        "uploads",
        "Audits",
        auditSlug,
        slotFolder,
        ...segments,
      );
      buffer = await readLocalFile(localPath);
    }

    if (!buffer) continue;

    zip.file(relPath, new Uint8Array(buffer));
    added += 1;
  }

  if (added === 0) {
    return NextResponse.json(
      { error: "Files could not be read from storage" },
      { status: 502 },
    );
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const zipName = folderPath
    ? `${slugify(folderPath.split("/").pop() ?? slotFolder, slotFolder)}.zip`
    : `${slugify(audit.title, auditId)}_${slugify(slotFolder, slot)}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zipBuffer.length),
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
