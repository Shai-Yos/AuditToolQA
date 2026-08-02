import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { join } from "path";
import {
  isOneDriveUrl,
  extractDrivePath,
  getOneDriveFileBuffer,
  readLocalFile,
} from "@/server/lib/oneDriveClient";

/** Format a Date to a readable string: DD/MM/YYYY HH:MM */
function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

const safeSegment = (s: string, fallback: string) =>
  s
    .trim()
    .replace(/[^a-zA-Z0-9._\- ]+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 100) || fallback;

/** Same slugify as the upload routes so folder names match OneDrive exactly */
const slugify = (s: string, fallback: string) =>
  s.trim().replace(/[\/\\:*?"<>|]/g, "_").substring(0, 100) || fallback;

async function fetchFileBuffer(url: string): Promise<Buffer | null> {
  if (isOneDriveUrl(url)) {
    const drivePath = extractDrivePath(url);
    const result = await getOneDriveFileBuffer(drivePath);
    return result?.buffer ?? null;
  }
  if (url.startsWith("/api/uploads/")) {
    const relative = url.replace(/^\/api\/uploads\//, "");
    const localPath = join(process.cwd(), "public", "uploads", relative);
    return readLocalFile(localPath);
  }
  return null;
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

  // ── Sheet 8: Transcriptions (one sheet per FR) ──
  const transcriptionMsgs = audit.chatMessages.filter((m) =>
    m.channel.endsWith("-transcription"),
  );
  // Group by FR number, preserving order
  const frMap = new Map<number, typeof transcriptionMsgs>();
  for (const m of transcriptionMsgs) {
    const match = /^fr(\d+)-transcription$/.exec(m.channel);
    if (!match) continue;
    const frNum = parseInt(match[1]!, 10);
    if (!frMap.has(frNum)) frMap.set(frNum, []);
    frMap.get(frNum)!.push(m);
  }
  // Sort FR numbers and add one sheet each
  for (const frNum of [...frMap.keys()].sort((a, b) => a - b)) {
    const msgs = frMap.get(frNum)!;
    const transcRows = msgs.map((m) => ({
      Author: m.authorName,
      Role: m.authorRole ?? "",
      Transcription: htmlToText(m.text),
      "Last Edited At": fmtDate(m.editedAt ?? m.createdAt),
    }));
    const wsTransc = XLSX.utils.json_to_sheet(transcRows);
    wsTransc["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 100 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsTransc, `FR${frNum} Transcription`);
  }

  // ── Sheet 9: Request Notes (history) ──
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
  // Everything goes under the exact audit title, matching AuditTool/Audits/{audit.title}/
  const zip = new JSZip();
  const root = zip.folder(audit.title)!;

  // requests/ — one subfolder per request (slug matches the upload convention)
  const requestsFolder = root.folder("requests")!;
  const allDocs = audit.requests.flatMap((r) =>
    r.documents.map((d) => ({ request: r, doc: d })),
  );
  await Promise.all(
    allDocs.map(async ({ request: r, doc: d }) => {
      const buf = await fetchFileBuffer(d.url);
      if (!buf) return;
      const reqSlug = slugify(r.trackNumber ?? r.title ?? r.id, r.id);
      requestsFolder.folder(reqSlug)!.file(d.filename, new Uint8Array(buf));
    }),
  );

  // General files (slot = "agenda")
  const agendaFiles = await db.auditFile.findMany({
    where: { auditId, slot: "agenda", NOT: { fileUrl: { startsWith: "folder:" } } },
    select: { fileName: true, fileUrl: true },
  });
  if (agendaFiles.length > 0) {
    const agendaFolder = root.folder("General")!;
    await Promise.all(
      agendaFiles.map(async (f) => {
        const buf = await fetchFileBuffer(f.fileUrl);
        if (!buf) return;
        // f.fileName stores the slot-relative path e.g. "SubFolder/report.pdf"
        agendaFolder.file(f.fileName, new Uint8Array(buf));
      }),
    );
  }

  // Ready Box files (slot = "readyBox")
  const readyBoxFiles = await db.auditFile.findMany({
    where: { auditId, slot: "readyBox", NOT: { fileUrl: { startsWith: "folder:" } } },
    select: { fileName: true, fileUrl: true },
  });
  if (readyBoxFiles.length > 0) {
    const readyBoxFolder = root.folder("Ready Box")!;
    await Promise.all(
      readyBoxFiles.map(async (f) => {
        const buf = await fetchFileBuffer(f.fileUrl);
        if (!buf) return;
        readyBoxFolder.file(f.fileName, new Uint8Array(buf));
      }),
    );
  }

  // Always include the XLSX
  root.file(`${safeName}_export.xlsx`, new Uint8Array(buffer));

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

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
