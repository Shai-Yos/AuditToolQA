import { join } from "path";
import { db } from "@/server/db";
import { uploadFile } from "@/server/lib/oneDriveClient";

const EXPORT_STATE_KEY_PREFIX = "transcription_export";

function nowStamp(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
}

function stateKey(auditId: string, channel: string): string {
  return `${EXPORT_STATE_KEY_PREFIX}:${auditId}:${channel}`;
}

function buildVersion(msg: { id: string; editedAt: Date | null; createdAt: Date }): string {
  return `${msg.id}:${(msg.editedAt ?? msg.createdAt).toISOString()}`;
}

function buildHtmlDocument(params: {
  auditTitle: string;
  channel: string;
  exportedAt: Date;
  contentHtml: string;
}): string {
  const exportedAt = params.exportedAt.toISOString();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${params.auditTitle} - ${params.channel} transcription</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; color: #0f172a; }
    .meta { color: #475569; font-size: 12px; margin-bottom: 16px; }
    .panel { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
  </style>
</head>
<body>
  <h1>${params.auditTitle}</h1>
  <div class="meta">Channel: ${params.channel} | Exported at: ${exportedAt}</div>
  <div class="panel">${params.contentHtml}</div>
</body>
</html>`;
}

export type ExportTranscriptionResult = {
  status: "exported" | "skipped" | "not-found";
  reason?: string;
  channel?: string;
  fileName?: string;
};

export async function exportTranscriptionChannel(params: {
  auditId: string;
  channel: string;
  force?: boolean;
}): Promise<ExportTranscriptionResult> {
  const { auditId, channel, force = false } = params;
  if (!channel.endsWith("-transcription")) {
    return { status: "skipped", reason: "Not a transcription channel", channel };
  }

  const [audit, latest] = await Promise.all([
    db.audit.findUnique({ where: { id: auditId }, select: { id: true, title: true, trackId: true } }),
    db.chatMessage.findFirst({
      where: { auditId, channel },
      orderBy: { createdAt: "desc" },
      select: { id: true, text: true, editedAt: true, createdAt: true },
    }),
  ]);

  if (!audit || !latest) {
    return { status: "not-found", reason: "Audit or transcription not found", channel };
  }

  const content = latest.text?.trim() ?? "";
  if (!content) {
    return { status: "skipped", reason: "Transcription is empty", channel };
  }

  const version = buildVersion(latest);
  if (!force) {
    const existingState = await db.appConfig.findUnique({
      where: { key: stateKey(auditId, channel) },
      select: { value: true },
    });
    if (existingState?.value === version) {
      return { status: "skipped", reason: "No changes since last export", channel };
    }
  }

  const baseTitle = audit.title;
  const auditFolderTitle = audit.trackId ? `${audit.trackId} ${baseTitle}` : baseTitle;
  const auditSlug = sanitizeFileNamePart(auditFolderTitle).substring(0, 100) || audit.id;
  const channelFilePart = sanitizeFileNamePart(channel);
  const fileName = `${nowStamp()}_${channelFilePart}.html`;

  const html = buildHtmlDocument({
    auditTitle: auditFolderTitle,
    channel,
    exportedAt: new Date(),
    contentHtml: content,
  });

  const relativePath = `Audits/${auditFolderTitle}/Chat/${fileName}`;
  const localDir = join(process.cwd(), "public", "uploads", auditSlug, "chats");
  const apiUrlPath = `/api/uploads/${auditSlug}/chats/${encodeURIComponent(fileName)}`;

  await uploadFile(Buffer.from(html, "utf8"), relativePath, localDir, fileName, apiUrlPath);

  await db.appConfig.upsert({
    where: { key: stateKey(auditId, channel) },
    update: { value: version },
    create: { key: stateKey(auditId, channel), value: version },
  });

  return { status: "exported", channel, fileName };
}

export async function exportChangedTranscriptions(params?: {
  maxChannelsPerRun?: number;
}): Promise<{ scanned: number; exported: number; skipped: number; notFound: number }> {
  const maxChannelsPerRun = params?.maxChannelsPerRun ?? 200;

  const rows = await db.chatMessage.findMany({
    where: { channel: { endsWith: "-transcription" } },
    orderBy: { createdAt: "desc" },
    select: { auditId: true, channel: true },
  });

  const unique: Array<{ auditId: string; channel: string }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.auditId}:${row.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ auditId: row.auditId, channel: row.channel });
    if (unique.length >= maxChannelsPerRun) break;
  }

  let exported = 0;
  let skipped = 0;
  let notFound = 0;

  for (const row of unique) {
    const result = await exportTranscriptionChannel({
      auditId: row.auditId,
      channel: row.channel,
      force: false,
    });
    if (result.status === "exported") exported++;
    else if (result.status === "not-found") notFound++;
    else skipped++;
  }

  return {
    scanned: unique.length,
    exported,
    skipped,
    notFound,
  };
}
