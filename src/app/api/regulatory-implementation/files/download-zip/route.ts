import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import JSZip from "jszip";
import { db } from "~/server/db";
import { requireRegulatoryImplementationAccess } from "~/server/helpers/currentUser";
import {
  extractDrivePath,
  getOneDriveFileBuffer,
  isOneDriveUrl,
  readLocalFile,
} from "@/server/lib/oneDriveClient";

const LOCAL_BASE = "AuditTool";
const RIL = "Regulatory Implementation of Lessons Learned";
const RIL_PREFIX = `${RIL}/`;

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
    await requireRegulatoryImplementationAccess();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const browserPath = sanitiseFolderPath(
    new URL(request.url).searchParams.get("path"),
  );

  const dbScope = browserPath ? `${RIL_PREFIX}${browserPath}/` : RIL_PREFIX;

  const rows = await db.regulatoryImplementationFile.findMany({
    select: { fileName: true, fileUrl: true },
  });

  const filesInScope = rows.filter((r) => {
    if (r.fileUrl.startsWith("folder:")) return false;
    return r.fileName.startsWith(dbScope);
  });

  if (filesInScope.length === 0) {
    return NextResponse.json({ error: "No files to download" }, { status: 404 });
  }

  type Entry = { relPath: string; row: (typeof filesInScope)[number] };
  const entries: Entry[] = filesInScope.flatMap((row) => {
    let dbName = row.fileName;
    if (dbName.startsWith(RIL_PREFIX)) dbName = dbName.slice(RIL_PREFIX.length);
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
      if (fileSegments[0] !== RIL) {
        fileSegments = [RIL, ...fileSegments];
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
    ? `${safeZipName(browserPath.split("/").pop() ?? RIL, RIL)}.zip`
    : `${safeZipName(RIL, "Regulatory_Implementation_of_Lessons_Learned")}.zip`;

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
