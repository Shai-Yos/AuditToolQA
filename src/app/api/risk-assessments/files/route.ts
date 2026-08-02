import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { db } from "~/server/db";
import { requireAdmin, requireUser } from "~/server/helpers/currentUser";
import {
  uploadFile,
  createFolder,
  deleteOneDriveFile,
  deleteLocalFile,
  deleteLocalFolder,
} from "@/server/lib/oneDriveClient";

// Path of the dedicated root folder inside the AuditTool drive
const LOCAL_BASE = "AuditTool";
const ROOT_LABEL = "Annual Internal Audit Risk Assessments";

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
  return join(process.cwd(), "public", "uploads", LOCAL_BASE, ROOT_LABEL, ...segments);
}

// GET /api/risk-assessments/files — list from DB (any user)
export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.riskAssessmentFile.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, fileUrl: true, createdAt: true },
  });

  const mapped = rows.map((f) => {
    const isFolder = f.fileUrl.startsWith("folder:");
    const fileUrl = isFolder
      ? null
      : `/api/uploads/${LOCAL_BASE}/${encodeURIComponent(ROOT_LABEL)}/${f.fileName.split("/").map(encodeURIComponent).join("/")}`;
    return { id: f.id, kind: isFolder ? "folder" : "file", fileName: f.fileName, fileUrl, createdAt: f.createdAt.toISOString() };
  });

  return NextResponse.json(mapped);
}

// POST /api/risk-assessments/files
//   • multipart/form-data with `file`, optional `relativePath` → upload file
//   • multipart/form-data with `kind=folder`, `path` → create folder
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const kind = (formData.get("kind") as string | null) ?? "file";

  // ── Folder creation ──────────────────────────────────────────────────────
  if (kind === "folder") {
    const pathRaw = (formData.get("path") as string | null) ?? "";
    const segments = normalisePath(pathRaw);
    if (segments.length === 0) {
      return NextResponse.json({ error: "Folder path is required" }, { status: 400 });
    }
    const folderPath = segments.join("/");

    const existing = await db.riskAssessmentFile.findFirst({
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

    const relativePath = [ROOT_LABEL, ...segments].join("/");
    const result = await createFolder(relativePath, localDirFor(segments));

    const created = await db.riskAssessmentFile.create({
      data: {
        fileUrl: result.url, // "folder:/AuditTool/Annual Risk Assessments/..."
        fileName: folderPath,
      },
    });

    return NextResponse.json({
      id: created.id,
      kind: "folder",
      fileName: created.fileName,
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

  const filename = safeSegments[safeSegments.length - 1]!;
  const subFolders = safeSegments.slice(0, -1);

  const localDir = localDirFor(subFolders);
  const relativePath = [ROOT_LABEL, ...safeSegments].join("/");
  const apiUrlPath = `/api/uploads/${LOCAL_BASE}/${encodeURIComponent(ROOT_LABEL)}/${safeSegments
    .map(encodeURIComponent)
    .join("/")}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const result = await uploadFile(buffer, relativePath, localDir, filename, apiUrlPath);

  const displayName = safeSegments.length > 1 ? safeSegments.join("/") : file.name;

  const created = await db.riskAssessmentFile.create({
    data: {
      fileUrl: result.url,
      fileName: displayName,
    },
  });

  return NextResponse.json({
    id: created.id,
    kind: "file",
    fileName: created.fileName,
    fileUrl: result.url.startsWith("onedrive:")
      ? `/api/uploads/${result.url.replace("onedrive:/AuditTool/", "")}`
      : result.url,
    createdAt: created.createdAt.toISOString(),
  });
}

// DELETE /api/risk-assessments/files?fileId=xxx — delete a file or folder
export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fileId = new URL(request.url).searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const record = await db.riskAssessmentFile.findFirst({
    where: { id: fileId },
    select: { id: true, fileUrl: true, fileName: true },
  });

  if (!record) return NextResponse.json({ ok: true });

  const isFolder = record.fileUrl.startsWith("folder:");

  if (isFolder) {
    const folderPath = record.fileName;
    const prefix = `${folderPath}/`;

    await db.riskAssessmentFile.deleteMany({
      where: {
        OR: [{ fileName: { startsWith: prefix } }, { id: record.id }],
      },
    });

    // OneDrive DELETE on a folder is recursive
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

  await db.riskAssessmentFile.deleteMany({ where: { id: fileId } });

  return NextResponse.json({ ok: true });
}
