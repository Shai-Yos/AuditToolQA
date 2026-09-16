import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { createHash } from "crypto";
import {
  getOneDriveFileBuffer,
  listOneDriveFolderEntries,
  uploadFile,
} from "@/server/lib/oneDriveClient";

// Ensure this route always runs on Node.js (JSZip + Buffer) and is never
// statically cached — otherwise the streamed ZIP body can be truncated /
// re-encoded, producing an "invalid archive" error at extraction time.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Format a Date to a readable UTC string: DD/MM/YYYY HH:MM UTC */
function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Convert HTML rich text to readable plain text for Excel */
function htmlToText(html: string): string {
  let text = html;
  // Horizontal rules → separator
  text = text.replace(/<hr\s*\/?>/gi, "\n---\n");
  // List items → bullet / number
  let olIndex = 0;
  text = text.replace(/<ol[^>]*>/gi, () => { olIndex = 0; return ""; });
  text = text.replace(/<li[^>]*>/gi, (_, offset) => {
    // Check if inside an <ol> by looking back
    const before = text.slice(0, offset);
    const lastOl = before.lastIndexOf("<ol");
    const lastUl = before.lastIndexOf("<ul");
    if (lastOl > lastUl) {
      olIndex++;
      return `${olIndex}. `;
    }
    return "• ";
  });
  // Block-level closing tags → newline
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/** Limit concurrent async operations to avoid overwhelming APIs */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrent: number = 5,
): Promise<(T | null)[]> {
  const results: (T | null)[] = [];
  let running = 0;
  let completed = 0;

  return new Promise((resolve) => {
    const startNext = () => {
      if (completed === tasks.length) {
        resolve(results);
        return;
      }
      while (running < maxConcurrent && completed < tasks.length) {
        const taskIndex = completed;
        completed++;
        running++;

        Promise.resolve(tasks[taskIndex]!())
          .then((result) => {
            results[taskIndex] = result;
            running--;
            startNext();
          })
          .catch((err) => {
            results[taskIndex] = null;
            running--;
            console.error(`Task ${taskIndex} failed:`, err);
            startNext();
          });
      }
    };

    startNext();
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const exportType = new URL(req.url).searchParams.get("type") ?? "excel"; // "excel" | "zip"

  let currentUser;
  try {
    currentUser = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.role !== "ADMIN" && currentUser.role !== "AUDIT_OWNER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    include: {
      createdBy: { select: { name: true, email: true } },
      requestStatuses: { orderBy: { order: "asc" } },
      users: {
        include: { user: { select: { name: true, email: true } } },
      },
      requests: {
        include: {
          requestStatus: { select: { name: true } },
          documents: {
            include: { uploadedBy: { select: { name: true, email: true } } },
          },
          assignees: true,
          comments: { orderBy: { createdAt: "asc" } },
          notes: { orderBy: { createdAt: "asc" } },
          createdBy: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      chatMessages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Audit Info ──
  const auditInfo = [
    ["Field", "Value"],
    ["Title", audit.title],
    ["Status", audit.status],
    ["Description", audit.description ?? ""],
    ["Created By", audit.createdBy?.name ?? audit.createdByName ?? ""],
    ["Created At", fmtDate(audit.createdAt)],
    ["Start Date", fmtDate(audit.startAt)],
    ["End Date", fmtDate(audit.endAt)],
    ["Front Rooms", audit.frontRoomsCount],
    ["Back Rooms", audit.backRoomsCount],
    ["Total Requests", audit.requests.length],
    ["Total Assignees", audit.users.length],
    ["Total Chat Messages", audit.chatMessages.length],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(auditInfo);
  wsInfo["!cols"] = [{ wch: 20 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Audit Info");

  // ── Sheet 2: Status Columns ──
  const statusRows = audit.requestStatuses.map((s) => ({
    Name: s.name,
    Order: s.order,
  }));
  if (statusRows.length > 0) {
    const wsStatuses = XLSX.utils.json_to_sheet(statusRows);
    wsStatuses["!cols"] = [{ wch: 25 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsStatuses, "Status Columns");
  }

  // ── Sheet 3: Audit Assignees ──
  const assigneeRows = audit.users.map((a) => ({
    Name: a.user?.name ?? a.userName,
    Email: a.user?.email ?? "",
    Role: a.role,
    "Assigned At": fmtDate(a.createdAt),
  }));
  if (assigneeRows.length > 0) {
    const wsAssignees = XLSX.utils.json_to_sheet(assigneeRows);
    wsAssignees["!cols"] = [{ wch: 30 }, { wch: 35 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsAssignees, "Audit Assignees");
  }

  // ── Sheet 4: Requests ──
  const requestRows = audit.requests.map((r) => ({
    "Track #": r.trackNumber ?? "",
    Title: r.title,
    Status: r.requestStatus?.name ?? r.statusName,
    Type: r.isFormal ? "Formal" : "Informal",
    Labels: (() => { try { const p = JSON.parse(r.labels); return Array.isArray(p) ? (p as string[]).join(", ") : ""; } catch { return ""; } })(),
    "Created By": r.createdBy?.name ?? r.createdByName ?? "",
    "Created At": fmtDate(r.createdAt),
    "Updated At": fmtDate(r.updatedAt),
    Assignees: r.assignees.map((a) => a.assigneeName || a.userId).join(", "),
    Documents: r.documents.length,
    Comments: r.comments.length,
    "Note Text": htmlToText(r.noteText ?? ""),
    "Note Last Edited By": r.noteLastEditedBy ?? "",
    "Note Last Edited At": fmtDate(r.noteLastEditedAt),
  }));
  const wsRequests = XLSX.utils.json_to_sheet(
    requestRows.length > 0 ? requestRows : [{ "Track #": "", Title: "No requests" }],
  );
  wsRequests["!cols"] = [
    { wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 10 }, { wch: 30 },
    { wch: 25 }, { wch: 22 }, { wch: 22 }, { wch: 40 }, { wch: 10 },
    { wch: 10 }, { wch: 50 }, { wch: 25 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRequests, "Requests");

  // ── Sheet 5: Request Comments ──
  const commentRows = audit.requests.flatMap((r) =>
    r.comments.map((c) => ({
      "Request Track #": r.trackNumber ?? "",
      "Request Title": r.title,
      Author: c.authorName,
      Comment: htmlToText(c.text),
      "Created At": fmtDate(c.createdAt),
    })),
  );
  if (commentRows.length > 0) {
    const wsComments = XLSX.utils.json_to_sheet(commentRows);
    wsComments["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 25 }, { wch: 60 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsComments, "Comments");
  }

  // ── Sheet 6: Documents ──
  const docRows = audit.requests.flatMap((r) =>
    r.documents.map((d) => ({
      "Request Track #": r.trackNumber ?? "",
      "Request Title": r.title,
      Filename: d.filename,
      URL: d.url,
      "MIME Type": d.mime ?? "",
      "Size (bytes)": d.size ?? "",
      "Uploaded By": d.uploadedBy?.name ?? "",
      "Uploaded At": fmtDate(d.createdAt),
    })),
  );
  if (docRows.length > 0) {
    const wsDocs = XLSX.utils.json_to_sheet(docRows);
    wsDocs["!cols"] = [
      { wch: 12 }, { wch: 35 }, { wch: 30 }, { wch: 50 },
      { wch: 20 }, { wch: 14 }, { wch: 25 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDocs, "Documents");
  }

  // ── Sheet 7: Chat Messages (comm channels only) ──
  const chatRows = audit.chatMessages
    .filter((m) => !m.channel.endsWith("-transcription"))
    .map((m) => ({
      Channel: m.channel,
      Author: m.authorName,
      Role: m.authorRole ?? "",
      "Reply To Author": m.replyToAuthorName ?? "",
      "Reply To Message": m.replyToText ? htmlToText(m.replyToText) : "",
      Message: htmlToText(m.text),
      "File Name": m.fileName ?? "",
      "File URL": m.fileUrl ?? "",
      "Created At": fmtDate(m.createdAt),
      "Edited At": fmtDate(m.editedAt),
    }));
  if (chatRows.length > 0) {
    const wsChat = XLSX.utils.json_to_sheet(chatRows);
    wsChat["!cols"] = [
      { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 40 }, { wch: 60 },
      { wch: 25 }, { wch: 50 }, { wch: 22 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, wsChat, "Chat Messages");
  }

  // ── Sheet 8: Request Notes (history) ──
  const noteRows = audit.requests.flatMap((r) =>
    r.notes.map((n) => ({
      "Request Track #": r.trackNumber ?? "",
      "Request Title": r.title,
      Author: n.authorName,
      "Note Text": htmlToText(n.text),
      "Created At": fmtDate(n.createdAt),
      "Updated At": fmtDate(n.updatedAt),
    })),
  );
  if (noteRows.length > 0) {
    const wsNotes = XLSX.utils.json_to_sheet(noteRows);
    wsNotes["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 25 }, { wch: 60 }, { wch: 22 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsNotes, "Request Notes");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeName = audit.title.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "audit";

  // ── Excel-only response ──────────────────────────────────────────────────
  if (exportType !== "zip") {
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}_export.xlsx"`,
      },
    });
  }

  // ── ZIP response — mirrors OneDrive folder structure ──
  // Use the exact same sanitization as createAudit action to ensure proper folder naming
  // Only replace problematic characters: / \ : * ? " < > |
  const zip = new JSZip();
  const rootFolderName = `${audit.trackId || ""} ${audit.title}`.replace(/[\/\\:*?"<>|]/g, "_").trim() || "audit";

  // Mirror the exact OneDrive audit folder tree (folders + files).
  const oneDriveAuditRoot = `/AuditTool/Audits/${rootFolderName}`;
  const oneDriveEntries = await listOneDriveFolderEntries(oneDriveAuditRoot);

  // Sanitize a single path segment so every ZIP entry name is safe for
  // Windows Explorer's built-in "Compressed Folder" viewer, which is far
  // stricter than JSZip, 7-Zip, or WinRAR:
  //  - Non-ASCII characters (accents, non-Latin scripts, emoji, …) force
  //    JSZip to set the UTF-8 "language encoding flag" on that entry.
  //    Explorer's zipfldr.dll has long-standing bugs reading that flag and
  //    will report the ENTIRE archive as invalid, even though 7-Zip/WinRAR
  //    open it fine. Folding to ASCII avoids the flag being set at all.
  //  - Reserved chars: \ : * ? " < > | and control chars.
  //  - Trailing dots/spaces and reserved device names (CON, NUL, LPT1, …)
  //    are also invalid as Windows path segments.
  const RESERVED_WINDOWS_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
  const sanitizeSegment = (seg: string): string => {
    let s = seg
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, ""); // strip combining diacritical marks (é → e, ü → u, …)
    s = s.replace(/[^\x20-\x7E]/g, "_"); // any remaining non-ASCII printable → "_"
    s = s.replace(/[\\:*?"<>|\x00-\x1F]/g, "_");
    s = s.replace(/[. ]+$/, ""); // strip trailing dots/spaces (Windows-invalid)
    if (RESERVED_WINDOWS_NAMES.test(s)) s = `_${s}`;
    return s;
  };

  // Cap each segment's length. Audit titles and request titles are used as
  // folder names, and combined with a nested destination path on the user's
  // machine (e.g. Downloads\<zip name>\<root folder>\Requests\<request
  // title>\<filename>), long titles routinely push the full extracted path
  // past Windows' 260-character MAX_PATH limit. 7-Zip/WinRAR don't enforce
  // MAX_PATH, but Explorer's built-in extractor does and will refuse the
  // WHOLE archive with a generic "is invalid" error — matching this exact
  // symptom (works in 7-Zip, fails in the native Windows tool). Truncating
  // keeps entries short and appends a short hash so same-prefix titles
  // don't collide.
  const shortHash = (s: string): string =>
    createHash("md5").update(s).digest("hex").slice(0, 6);
  const MAX_FOLDER_SEGMENT_LEN = 40;
  const MAX_FILE_SEGMENT_LEN = 90;
  const capSegment = (seg: string, isFile: boolean): string => {
    const maxLen = isFile ? MAX_FILE_SEGMENT_LEN : MAX_FOLDER_SEGMENT_LEN;
    if (seg.length <= maxLen) return seg;
    if (isFile) {
      const dotIdx = seg.lastIndexOf(".");
      const ext = dotIdx > 0 && dotIdx >= seg.length - 12 ? seg.slice(dotIdx) : "";
      const base = ext ? seg.slice(0, dotIdx) : seg;
      const budget = Math.max(maxLen - ext.length - 7, 1);
      return `${base.slice(0, budget)}_${shortHash(seg)}${ext}`;
    }
    const budget = Math.max(maxLen - 7, 1);
    return `${seg.slice(0, budget)}_${shortHash(seg)}`;
  };

  const sanitizeZipPath = (rel: string, lastIsFile: boolean): string => {
    const segs = rel.split("/").map(sanitizeSegment).filter((seg) => seg.length > 0);
    return segs.map((seg, i) => capSegment(seg, lastIsFile && i === segs.length - 1)).join("/");
  };
  const safeRootFolderName = capSegment(sanitizeSegment(rootFolderName) || "audit", false);
  const root = zip.folder(safeRootFolderName)!;

  // Create only truly-empty folders explicitly; folders that contain files
  // will be auto-created by JSZip when we add the files.
  const fileEntries = oneDriveEntries.filter((e) => e.kind === "file");
  const folderEntries = oneDriveEntries.filter((e) => e.kind === "folder");

  // Compute each file's sanitized relative path once and reuse it for both
  // the empty-folder pre-creation pass and the download pass below (instead
  // of re-running the sanitize/cap logic twice per file).
  const relPathOf = (drivePath: string, isFile: boolean): string =>
    sanitizeZipPath(drivePath.slice(oneDriveAuditRoot.length).replace(/^\/+/, ""), isFile);
  const filesWithRelPaths = fileEntries.map((entry) => ({
    entry,
    rel: relPathOf(entry.drivePath, true),
  }));

  const folderPaths = new Set(
    folderEntries.map((e) => relPathOf(e.drivePath, false)).filter((p) => p.length > 0),
  );
  const filePathPrefixes = new Set<string>();
  for (const { rel } of filesWithRelPaths) {
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) {
      filePathPrefixes.add(parts.slice(0, i).join("/"));
    }
  }
  for (const folderPath of folderPaths) {
    if (!filePathPrefixes.has(folderPath)) {
      root.folder(folderPath);
    }
  }

  // ── Download OneDrive files with concurrency limiting (max 5 concurrent) ──
  const fileData = await runWithConcurrency(
    filesWithRelPaths.map(({ entry, rel }) => async () => {
      if (!rel) return null;
      try {
        const fetched = await getOneDriveFileBuffer(entry.drivePath);
        if (!fetched?.buffer) return null;
        return { rel, buffer: fetched.buffer };
      } catch (err) {
        console.error(`Failed to download ${rel}:`, err);
        return null;
      }
    }),
    5, // Max 5 concurrent requests
  );

  // Add downloaded files to ZIP sequentially, deduplicating any repeated paths.
  const addedPaths = new Set<string>();
  for (const file of fileData) {
    if (!file) continue;
    if (addedPaths.has(file.rel)) continue;
    addedPaths.add(file.rel);
    root.file(file.rel, file.buffer);
  }

  // ── Add Transcriptions as separate .txt files ──
  const transcriptionMsgs = audit.chatMessages.filter((m) =>
    m.channel.endsWith("-transcription"),
  );
  if (transcriptionMsgs.length > 0) {
    const frMap = new Map<number, typeof transcriptionMsgs>();
    for (const m of transcriptionMsgs) {
      const match = /^fr(\d+)-transcription$/.exec(m.channel);
      if (!match) continue;
      const frNum = parseInt(match[1]!, 10);
      if (!frMap.has(frNum)) frMap.set(frNum, []);
      frMap.get(frNum)!.push(m);
    }

    // Collect all transcription content first (concurrent OneDrive uploads)
    const transcData = await Promise.all(
      [...frMap.keys()]
        .sort((a, b) => a - b)
        .map(async (frNum) => {
          const msgs = frMap.get(frNum)!;
          const transcContent = msgs
            .map(
              (m, idx) =>
                `[${idx + 1}] ${m.authorName}${m.authorRole ? " (" + m.authorRole + ")" : ""}\n` +
                `Last edited: ${fmtDate(m.editedAt ?? m.createdAt)}\n\n` +
                `${htmlToText(m.text)}\n\n${"─".repeat(80)}\n\n`,
            )
            .join("");
          const fileName = `FR${frNum}_Transcription.txt`;
          const transcBuffer = Buffer.from(transcContent, "utf-8");

          // Save to OneDrive
          try {
            await uploadFile(
              transcBuffer,
              `Audits/${rootFolderName}/Transcriptions/${fileName}`,
              "",
              fileName,
              "",
            );
          } catch (err) {
            console.error(`Failed to upload transcription FR${frNum}:`, err);
          }

          return { fileName, content: transcContent };
        }),
    );

    // Add to ZIP sequentially. Convert content to Buffer so JSZip treats it
    // as binary (UTF-8) rather than trying to guess encoding on a JS string.
    const transcFolder = root.folder("Transcriptions")!;
    for (const item of transcData) {
      transcFolder.file(item.fileName, Buffer.from(item.content, "utf-8"));
    }
  }

  // Always include the XLSX
  root.file(`${safeName}_export.xlsx`, buffer);

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  console.log(`[audit export] Generated ZIP: ${zipBuffer.length} bytes, ${addedPaths.size} OneDrive files, ${transcriptionMsgs.length} transcription msgs`);

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zipBuffer.length),
      "Content-Disposition": `attachment; filename="${safeName}_export.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
