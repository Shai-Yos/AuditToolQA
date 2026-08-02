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

const LOCAL_BASE = "AuditTool";
const ROOT_LABEL = "Site Investigation Response Team (SIRT)";

function sanitiseFolderPath(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

const safeZipName = (s: string, fallback: string) =>
  s
    .trim()
    .replace(/[^a-zA-Z0-9._\- ]+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 100) || fallback;

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderPath = sanitiseFolderPath(
    new URL(request.url).searchParams.get("path"),
  );

  const rows = await db.sirtFile.findMany({
    select: { fileName: true, fileUrl: true },
  });

  const prefix = folderPath ? `${folderPath}/` : "";
  const filesInScope = rows.filter(
    (r) =>
      !r.fileUrl.startsWith("folder:") &&
      (prefix === "" || r.fileName.startsWith(prefix)),
  );

  if (filesInScope.length === 0) {
    return NextResponse.json({ error: "No files to download" }, { status: 404 });
  }

  type Entry = { relPath: string; row: (typeof filesInScope)[number] };
  const entries: Entry[] = filesInScope.flatMap((row) => {
    const relPath = prefix ? row.fileName.slice(prefix.length) : row.fileName;
    return relPath ? [{ relPath, row }] : [];
  });

  const buffers = await Promise.all(
    entries.map(async ({ row }) => {
      if (isOneDriveUrl(row.fileUrl)) {
        const fetched = await getOneDriveFileBuffer(extractDrivePath(row.fileUrl));
        return fetched?.buffer ?? null;
      }
      if (row.fileUrl.startsWith("/api/uploads/")) {
        const relative = decodeURIComponent(row.fileUrl.replace(/^\/api\/uploads\//, ""));
        return readLocalFile(join(process.cwd(), "public", "uploads", relative));
      }
      const segments = row.fileName.split("/").filter(Boolean);
      return readLocalFile(join(process.cwd(), "public", "uploads", LOCAL_BASE, ROOT_LABEL, ...segments));
    }),
  );

  const zip = new JSZip();
  let added = 0;
  for (let i = 0; i < entries.length; i++) {
    const buffer = buffers[i];
    if (!buffer) continue;
    zip.file(entries[i]!.relPath, buffer);
    added++;
  }

  if (added === 0) {
    return NextResponse.json({ error: "Files could not be read from storage" }, { status: 502 });
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const zipName = folderPath
    ? `${safeZipName(folderPath.split("/").pop() ?? ROOT_LABEL, ROOT_LABEL)}.zip`
    : `${safeZipName(ROOT_LABEL, "SIRT")}.zip`;

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
