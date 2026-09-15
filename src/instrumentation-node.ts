/**
 * Node-only implementation of the transcription auto-export scheduler.
 *
 * Kept in a SEPARATE file (not inlined into `instrumentation.ts`) because
 * Next.js compiles `instrumentation.ts` for BOTH the Node.js AND the Edge
 * runtime. This file imports `@/server/helpers/transcriptionExport`, which
 * transitively pulls in `path`, `fs`, and `fs/promises` — all unavailable
 * on Edge. The Edge bundle would fail to compile if it saw those imports.
 *
 * The recommended Next.js pattern is:
 *   - `instrumentation.ts` gates on `process.env.NEXT_RUNTIME === 'nodejs'`
 *     then dynamically imports THIS file.
 *   - Next.js special-cases that pattern so the Edge bundle never analyses
 *     this module.
 */

import { exportChangedTranscriptions } from "@/server/helpers/transcriptionExport";

const GLOBAL_KEY = "__transcriptionAutoExportTimer__";

type GlobalWithTimer = typeof globalThis & {
  [GLOBAL_KEY]?: NodeJS.Timeout | null;
};

export function startTranscriptionAutoExportScheduler(): void {
  const raw = process.env.TRANSCRIPTION_EXPORT_INTERVAL_MINUTES;
  const minutes = raw ? Number(raw) : 0;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return;
  }

  const g = globalThis as GlobalWithTimer;
  if (g[GLOBAL_KEY]) {
    // Already scheduled in this process (e.g. dev HMR re-import). Leave it be.
    return;
  }

  const intervalMs = Math.floor(minutes * 60_000);

  const run = async () => {
    try {
      const result = await exportChangedTranscriptions();
      console.log(
        `[transcription-auto-export] scanned=${result.scanned} exported=${result.exported} skipped=${result.skipped} notFound=${result.notFound}`,
      );
    } catch (err) {
      console.error("[transcription-auto-export] run failed:", err);
    }
  };

  // Delay first run to let the server warm up.
  const initialDelayMs = Math.min(60_000, intervalMs);
  const kickoff = setTimeout(() => {
    void run();
    const timer = setInterval(() => void run(), intervalMs);
    // Allow the process to exit even if the interval is still armed
    // (relevant for graceful shutdown / test runs).
    if (typeof timer.unref === "function") timer.unref();
    g[GLOBAL_KEY] = timer;
  }, initialDelayMs);
  if (typeof kickoff.unref === "function") kickoff.unref();

  console.log(
    `[transcription-auto-export] scheduler armed — every ${minutes} minute(s)`,
  );
}
