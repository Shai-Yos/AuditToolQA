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
const AAP = "Annual Internal Audit Plan";
const AAP_LEGACY = "Annual Audit Plan";
const AAP_PREFIX = `${AAP}/`;
const AAP_LEGACY_PREFIX = `${AAP_LEGACY}/`;

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

  const browserPath = sanitiseFolderPath(
    new URL(request.url).searchParams.get("path"),
  );

  const dbScope = browserPath ? `${AAP_PREFIX}${browserPath}/` : AAP_PREFIX;

  const rows = await db.auditPlanFile.findMany({
    select: { fileName: true, fileUrl: true },
  });

  const filesInScope = rows.filter((r) => {
    if (r.fileUrl.startsWith("folder:")) return false;
    if (r.fileName.startsWith(dbScope)) return true;
    const legacyScope = browserPath ? `${AAP_LEGACY_PREFIX}${browserPath}/` : AAP_LEGACY_PREFIX;
    if (r.fileName.startsWith(legacyScope)) return true;
    return false;
  });

  if (filesInScope.length === 0) {
    return NextResponse.json({ error: "No files to download" }, { status: 404 });
  }

  // Resolve relPath for each row first (filter out empties), then fetch all buffers in parallel
  type Entry = { relPath: string; row: (typeof filesInScope)[number] };
  const entries: Entry[] = filesInScope.flatMap((row) => {
    let dbName = row.fileName;
    if (dbName.startsWith(AAP_PREFIX)) dbName = dbName.slice(AAP_PREFIX.length);
    else if (dbName.startsWith(AAP_LEGACY_PREFIX)) dbName = dbName.slice(AAP_LEGACY_PREFIX.length);
    const relPath = browserPath ? dbName.slice(`${browserPath}/`.length) : dbName;
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
      // local fallback by fileName
      let fileSegments = row.fileName.split("/").filter(Boolean);
      if (!fileSegments[0]?.startsWith("Annual") && !fileSegments[0]?.startsWith("Audits")) {
        fileSegments = [AAP, ...fileSegments];
      }
      return readLocalFile(join(process.cwd(), "public", "uploads", LOCAL_BASE, ...fileSegments));
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
  const zipName = browserPath
    ? `${safeZipName(browserPath.split("/").pop() ?? AAP, AAP)}.zip`
    : `${safeZipName(AAP, "Annual_Audit_Plan")}.zip`;

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
