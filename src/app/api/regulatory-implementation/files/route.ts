import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { db } from "~/server/db";
import { requireAdmin, requireRegulatoryImplementationAccess } from "~/server/helpers/currentUser";
import {
  uploadFile,
  createFolder,
  deleteOneDriveFile,
  deleteLocalFile,
  deleteLocalFolder,
} from "@/server/lib/oneDriveClient";

// Local base folder for AuditTool files (under public/uploads/)
const LOCAL_BASE = "AuditTool";

/** Normalise a user-supplied path into safe slash-joined segments. */
function normalisePath(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/[^a-zA-Z0-9._\- ]/g, "_"));
}

function localDirFor(segments: string[]): string {
  return join(process.cwd(), "public", "uploads", LOCAL_BASE, ...segments);
}

// All regulatoryImplementationFile items are stored under this prefix in the DB and on disk/OneDrive.
const RIL = "Regulatory Implementation of Lessons Learned";
const RIL_PREFIX = `${RIL}/`;

// Default subfolders created automatically the first time the library is loaded.
// The CE/MDSAP label is shown in the UI, but the stored folder key remains
// CE-MDSAP because "/" is reserved as the path separator in this system.
const DEFAULT_FOLDERS = ["FDA", "CE/MDSAP", "Health Canada", "Other"];

/**
 * Convert a raw DB fileName to the browser-facing relative path (strips the
 * "Regulatory Implementation of Lessons Learned/" prefix). Returns null for
 * the root folder entry itself.
 */
function toBrowserPath(raw: string): string | null {
  if (raw === RIL) return null;
  if (raw.startsWith(RIL_PREFIX)) return raw.slice(RIL_PREFIX.length);
  return raw;
}

/** Create any of the four default subfolders that don't exist yet (idempotent). */
async function ensureDefaultFolders() {
  const existing = await db.regulatoryImplementationFile.findMany({
    where: {
      fileUrl: { startsWith: "folder:" },
      fileName: { in: DEFAULT_FOLDERS.map((name) => `${RIL_PREFIX}${name}`) },
    },
    select: { fileName: true },
  });
  const existingNames = new Set(existing.map((e) => e.fileName));

  for (const name of DEFAULT_FOLDERS) {
    const folderPath = `${RIL_PREFIX}${name}`;
    if (existingNames.has(folderPath)) continue;
    const fullSegments = [RIL, name];
    const result = await createFolder(fullSegments.join("/"), localDirFor(fullSegments));
    await db.regulatoryImplementationFile.create({
      data: { fileUrl: result.url, fileName: folderPath },
    });
  }
}

// GET /api/regulatory-implementation/files — list from DB (only users with group access)
export async function GET() {
  try {
    await requireRegulatoryImplementationAccess();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaultFolders();

  const rows = await db.regulatoryImplementationFile.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, fileUrl: true, createdAt: true },
  });

  const mapped = rows.flatMap((f) => {
    const browserPath = toBrowserPath(f.fileName);
    if (browserPath === null) return [];
    const isFolder = f.fileUrl.startsWith("folder:");
    const fileUrl = isFolder
      ? null
      : `/api/uploads/${LOCAL_BASE}/${encodeURIComponent(RIL)}/${browserPath.split("/").map(encodeURIComponent).join("/")}`;
    return [{ id: f.id, kind: isFolder ? "folder" : "file", fileName: browserPath, fileUrl, createdAt: f.createdAt.toISOString() }];
  });

  return NextResponse.json(mapped);
}

// POST /api/regulatory-implementation/files
//   • multipart/form-data with `file`, optional `relativePath` → upload file
//   • multipart/form-data with `kind=folder`, `path` → create folder
export async function POST(request: NextRequest) {
  try {
    await requireRegulatoryImplementationAccess();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const kind = (formData.get("kind") as string | null) ?? "file";

  // ── Folder creation ──────────────────────────────────────────────────────
  if (kind === "folder") {
    const pathRaw = (formData.get("path") as string | null) ?? "";
    // Browser sends bare paths (e.g. "FolderA" or "FolderA/SubFolder").
    // Prepend the Regulatory Implementation root before storing.
    const browserSegments = normalisePath(pathRaw);
    if (browserSegments.length === 0) {
      return NextResponse.json({ error: "Folder path is required" }, { status: 400 });
    }
    const fullSegments = [RIL, ...browserSegments];
    const folderPath = fullSegments.join("/"); // stored in DB

    const existing = await db.regulatoryImplementationFile.findFirst({
      where: {
        fileUrl: { startsWith: "folder:" },
        fileName: { equals: folderPath },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A folder with that name already exists here" },
        { status: 409 },
      );
    }

    const relativePath = fullSegments.join("/");
    const result = await createFolder(relativePath, localDirFor(fullSegments));

    const created = await db.regulatoryImplementationFile.create({
      data: {
        fileUrl: result.url,
        fileName: folderPath,
      },
    });

    return NextResponse.json({
      id: created.id,
      kind: "folder",
      // Return browser-facing path (without RIL prefix)
      fileName: browserSegments.join("/"),
      fileUrl: null,
      createdAt: created.createdAt.toISOString(),
    });
  }

  // ── File upload ──────────────────────────────────────────────────────────
  const file = formData.get("file") as File | null;
  const rawRelativePath = (formData.get("relativePath") as string | null) ?? null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const supplied =
    rawRelativePath && rawRelativePath.trim().length > 0 ? rawRelativePath : file.name;
  const rawSegments = supplied
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  const safeSegments = rawSegments.map((s) => s.replace(/[^a-zA-Z0-9._\- ]/g, "_"));
  if (safeSegments.length === 0) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  // Browser sends bare paths (e.g. "file.pdf" or "FolderA/file.pdf").
  // Prepend the Regulatory Implementation root for storage and disk paths.
  const filename = safeSegments[safeSegments.length - 1]!;
  const browserSubFolders = safeSegments.slice(0, -1);
  const fullSegments = [RIL, ...safeSegments];
  const fullSubFolders = [RIL, ...browserSubFolders];

  const localDir = localDirFor(fullSubFolders);
  const relativePath = fullSegments.join("/");
  const apiUrlPath = `/api/uploads/${LOCAL_BASE}/${fullSegments
    .map(encodeURIComponent)
    .join("/")}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const result = await uploadFile(buffer, relativePath, localDir, filename, apiUrlPath);

  // DB fileName includes the RIL prefix; browser display name is bare
  const dbFileName = fullSegments.join("/");
  const browserFileName = safeSegments.length > 1 ? safeSegments.join("/") : file.name;

  const created = await db.regulatoryImplementationFile.create({
    data: {
      fileUrl: result.url,
      fileName: dbFileName,
    },
  });

  return NextResponse.json({
    id: created.id,
    kind: "file",
    // Return browser-facing path (without RIL prefix)
    fileName: browserFileName,
    fileUrl: result.url.startsWith("onedrive:")
      ? `/api/uploads/${result.url.replace("onedrive:/AuditTool/", "")}`
      : result.url,
    createdAt: created.createdAt.toISOString(),
  });
}

// DELETE /api/regulatory-implementation/files?fileId=xxx — delete a file or folder
export async function DELETE(request: NextRequest) {
  try {
    await requireRegulatoryImplementationAccess();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fileId = new URL(request.url).searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const record = await db.regulatoryImplementationFile.findFirst({
    where: { id: fileId },
    select: { id: true, fileUrl: true, fileName: true },
  });

  if (!record) return NextResponse.json({ ok: true });

  const isFolder = record.fileUrl.startsWith("folder:");

  if (isFolder) {
    const folderPath = record.fileName;
    const prefix = `${folderPath}/`;

    await db.regulatoryImplementationFile.deleteMany({
      where: {
        OR: [{ fileName: { startsWith: prefix } }, { id: record.id }],
      },
    });

    const drivePath = record.fileUrl.replace(/^folder:/, "");
    await deleteOneDriveFile(drivePath);

    const localFolder = localDirFor(folderPath.split("/"));
    await deleteLocalFolder(localFolder);

    return NextResponse.json({ ok: true });
  }

  // Single file
  if (record.fileUrl.startsWith("onedrive:")) {
    const drivePath = record.fileUrl.replace("onedrive:", "");
    await deleteOneDriveFile(drivePath);
  } else {
    const relativePath = record.fileUrl.replace(/^\/api\/uploads\//, "");
    const localPath = join(process.cwd(), "public", "uploads", relativePath);
    await deleteLocalFile(localPath);
  }

  await db.regulatoryImplementationFile.deleteMany({ where: { id: fileId } });

  return NextResponse.json({ ok: true });
}
