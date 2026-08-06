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

const ALLOWED_SLOTS = ["agenda", "readyBox", "auditors"] as const;
type Slot = (typeof ALLOWED_SLOTS)[number];

const slugify = (s: string, fallback: string) =>
  s
    .trim()
    .replace(/[\/\\:*?"<>|]/g, "_")
    .substring(0, 100) || fallback;

const slotFolderName = (slot: Slot) =>
  slot === "agenda" ? "General" : slot === "readyBox" ? "Ready Box" : "Auditors";

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

// GET /api/audits/[auditId]/files?slot=agenda|readyBox — list files for a slot (any logged-in user)
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
  const slot = new URL(request.url).searchParams.get("slot") ?? "";

  if (!ALLOWED_SLOTS.includes(slot as Slot)) {
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  }

  const files = await db.auditFile.findMany({
    where: { auditId, slot },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileUrl: true, fileName: true, createdAt: true },
  });

  return NextResponse.json(
    files.map((f) => {
      const isFolder = f.fileUrl.startsWith("folder:");
      return {
        id: f.id,
        kind: isFolder ? "folder" : "file",
        fileName: f.fileName,
        fileUrl: isFolder
          ? null
          : f.fileUrl.startsWith("onedrive:")
            ? `/api/uploads/${f.fileUrl.replace("onedrive:/AuditTool/", "")}`
            : f.fileUrl,
        createdAt: f.createdAt.toISOString(),
      };
    }),
  );
}

// POST /api/audits/[auditId]/files
//   • multipart/form-data with `slot`, `file`, optional `relativePath` → upload file
//   • multipart/form-data with `slot`, `kind=folder`, `path` → create folder
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  let currentUser;
  try {
    currentUser = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await params;

  // Only admins and the audit owner may upload files
  if (currentUser.role !== "ADMIN") {
    const audit = await db.audit.findUnique({ where: { id: auditId }, select: { createdById: true } });
    if (!audit || audit.createdById !== currentUser.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  const formData = await request.formData();
  const slot = formData.get("slot") as string;
  const kind = (formData.get("kind") as string | null) ?? "file";

  if (!ALLOWED_SLOTS.includes(slot as Slot)) {
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  }

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { title: true },
  });
  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  const auditSlug = slugify(audit.title, auditId); // kept for local fallback paths
  const auditFolderName = audit.title; // exact name as it exists on OneDrive
  const slotFolder = slotFolderName(slot as Slot);

  // ── Folder creation ──────────────────────────────────────────────────────
  if (kind === "folder") {
    const pathRaw = (formData.get("path") as string | null) ?? "";
    const segments = normalisePath(pathRaw);
    if (segments.length === 0) {
      return NextResponse.json({ error: "Folder path is required" }, { status: 400 });
    }
    const folderPath = segments.join("/");

    // Reject duplicates (case-insensitive within the same slot)
    const existing = await db.auditFile.findFirst({
      where: {
        auditId,
        slot,
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

    const relativePath = ["Audits", auditFolderName, slotFolder, ...segments].join("/");
    const localDir = join(
      process.cwd(),
      "public",
      "uploads",
      "Audits",
      auditSlug,
      slotFolder,
      ...segments,
    );

    const result = await createFolder(relativePath, localDir);

    const created = await db.auditFile.create({
      data: {
        auditId,
        slot,
        fileUrl: result.url, // "folder:/AuditTool/..."
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
  // Optional path inside the slot folder (e.g. "MyFolder/sub/document.pdf").
  const rawRelativePath = (formData.get("relativePath") as string | null) ?? null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Build the safe segments. If no relativePath supplied, just the file name.
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
  const localDir = join(
    process.cwd(),
    "public",
    "uploads",
    "Audits",
    auditSlug,
    slotFolder,
    ...subFolders,
  );

  const relativePath = ["Audits", auditFolderName, slotFolder, ...safeSegments].join("/");
  const apiUrlPath = `/api/uploads/Audits/${auditSlug}/${encodeURIComponent(slotFolder)}/${safeSegments
    .map(encodeURIComponent)
    .join("/")}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const result = await uploadFile(buffer, relativePath, localDir, filename, apiUrlPath);

  // Preserve folder path in the displayed file name so the UI can group files.
  const displayName = safeSegments.length > 1 ? safeSegments.join("/") : file.name;

  const created = await db.auditFile.create({
    data: {
      auditId,
      slot,
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

// DELETE /api/audits/[auditId]/files?fileId=xxx — delete a file or folder.
// When deleting a folder, all files inside it are removed as well.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  let currentUser;
  try {
    currentUser = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await params;

  // Only admins and the audit owner may delete files
  if (currentUser.role !== "ADMIN") {
    const audit = await db.audit.findUnique({ where: { id: auditId }, select: { createdById: true } });
    if (!audit || audit.createdById !== currentUser.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }
  const fileId = new URL(request.url).searchParams.get("fileId");

  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const record = await db.auditFile.findFirst({
    where: { id: fileId, auditId },
    select: { id: true, slot: true, fileUrl: true, fileName: true },
  });

  if (!record) {
    return NextResponse.json({ ok: true });
  }

  const isFolder = record.fileUrl.startsWith("folder:");

  if (isFolder) {
    const slot = record.slot as Slot;
    const folderPath = record.fileName;

    const audit = await db.audit.findUnique({
      where: { id: auditId },
      select: { title: true },
    });

    // Delete every child row (files + nested folders) under this path
    const prefix = `${folderPath}/`;
    await db.auditFile.deleteMany({
      where: {
        auditId,
        slot,
        OR: [{ fileName: { startsWith: prefix } }, { id: record.id }],
      },
    });

    // Remove the folder on OneDrive (recursively) and locally
    const drivePath = record.fileUrl.replace(/^folder:/, "");
    await deleteOneDriveFile(drivePath); // OneDrive DELETE works recursively

    if (audit) {
      const auditSlug = slugify(audit.title, auditId);
      const slotFolder = slotFolderName(slot);
      const localFolder = join(
        process.cwd(),
        "public",
        "uploads",
        "Audits",
        auditSlug,
        slotFolder,
        ...folderPath.split("/"),
      );
      await deleteLocalFolder(localFolder);
    }

    return NextResponse.json({ ok: true });
  }

  // Single file delete
  if (record.fileUrl.startsWith("onedrive:")) {
    const drivePath = record.fileUrl.replace("onedrive:", "");
    await deleteOneDriveFile(drivePath);
  } else {
    const relativePath = record.fileUrl.replace(/^\/api\/uploads\//, "");
    const localPath = join(process.cwd(), "public", "uploads", relativePath);
    await deleteLocalFile(localPath);
  }

  await db.auditFile.deleteMany({
    where: { id: fileId, auditId },
  });

  return NextResponse.json({ ok: true });
}
