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

function formatExportedAt(date: Date): string {
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mon = monthNames[date.getUTCMonth()]!;
  const yyyy = String(date.getUTCFullYear());
  const datePart = `${dd} ${mon} ${yyyy}`;

  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);

  return `${datePart} ${timePart}`;
}

function buildHtmlDocument(params: {
  auditTitle: string;
  channel: string;
  exportedAt: Date;
  contentHtml: string;
}): string {
  const exportedAt = `${formatExportedAt(params.exportedAt)} UTC`;
  const channelLabel = params.channel.replace(/-/g, " ").toUpperCase();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${params.auditTitle} - ${params.channel} transcription</title>
  <style>
    :root {
      --bg: #f4f6f9;
      --paper: #ffffff;
      --ink: #172554;
      --body: #1e293b;
      --muted: #475569;
      --line: #dbe3ee;
      --brand: #0f4c81;
      --accent: #d7e6f5;
      --chip-bg: #eef4fb;
    }

    * { box-sizing: border-box; }

    html, body {
      min-height: 100%;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--body);
      font-family: "Segoe UI", "Calibri", "Arial", sans-serif;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    .sheet {
      max-width: 960px;
      margin: 28px auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: 0 10px 34px rgba(15, 76, 129, 0.08);
      overflow: hidden;
    }

    .header {
      padding: 22px 28px 16px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(110deg, #f5f9ff 0%, #ecf4fc 100%);
    }

    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .doc-title {
      margin: 0;
      color: var(--ink);
      font-size: 23px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }

    .tag {
      display: inline-block;
      border: 1px solid #b8cde4;
      background: var(--chip-bg);
      color: var(--brand);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      padding: 5px 10px;
      border-radius: 999px;
      white-space: nowrap;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }

    .meta-item {
      border: 1px solid var(--line);
      background: #ffffff;
      border-radius: 8px;
      padding: 8px 10px;
    }

    .meta-label {
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.55px;
      margin: 0 0 2px;
    }

    .meta-value {
      margin: 0;
      color: #0f172a;
      font-size: 13px;
      font-weight: 600;
      word-break: break-word;
    }

    .content {
      padding: 22px 28px 28px;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 18px;
      background: #fff;
    }

    .panel p { margin: 0.4em 0; }
    .panel h1, .panel h2, .panel h3 { color: #0f172a; margin: 0.6em 0 0.35em; }
    .panel ul, .panel ol { margin: 0.4em 0 0.55em 1.2em; }
    .panel blockquote {
      margin: 0.75em 0;
      padding: 0.5em 0.9em;
      border-left: 4px solid var(--accent);
      background: #f8fbff;
      color: #334155;
    }

    .footer {
      border-top: 1px solid var(--line);
      background: #fafcfe;
      padding: 10px 28px;
      color: var(--muted);
      font-size: 11px;
    }

    @media print {
      body { background: #fff; }
      .sheet {
        margin: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      .header, .content, .footer { padding-left: 0; padding-right: 0; }
      .panel { border-color: #d7dee9; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="header">
      <div class="header-top">
        <h1 class="doc-title">Audit Transcription Record</h1>
      </div>
      <div class="meta-grid">
        <section class="meta-item">
          <p class="meta-label">Audit</p>
          <p class="meta-value">${params.auditTitle}</p>
        </section>
        <section class="meta-item">
          <p class="meta-label">Channel</p>
          <p class="meta-value">${channelLabel}</p>
        </section>
        <section class="meta-item">
          <p class="meta-label">Exported At</p>
          <p class="meta-value">${exportedAt}</p>
        </section>
      </div>
    </header>
    <section class="content">
      <div class="panel">${params.contentHtml}</div>
    </section>
    <footer class="footer">
      Generated by Audit Management Tool transcription export.
    </footer>
  </main>
</body>
</html>`;
}

export type ExportTranscriptionResult = {
  status: "exported" | "skipped" | "not-found";
  reason?: string;
  channel?: string;
  fileName?: string;
  downloadPath?: string;
  drivePath?: string;
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

  const uploaded = await uploadFile(Buffer.from(html, "utf8"), relativePath, localDir, fileName, apiUrlPath);

  const downloadPath = uploaded.drivePath
    ? `/api/audits/${encodeURIComponent(auditId)}/transcription/export/download?drivePath=${encodeURIComponent(uploaded.drivePath)}&fileName=${encodeURIComponent(fileName)}`
    : undefined;

  await db.appConfig.upsert({
    where: { key: stateKey(auditId, channel) },
    update: { value: version },
    create: { key: stateKey(auditId, channel), value: version },
  });

  return {
    status: "exported",
    channel,
    fileName,
    downloadPath,
    drivePath: uploaded.drivePath,
  };
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
