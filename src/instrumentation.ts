/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * This file is compiled for BOTH the Node.js and Edge runtimes. It MUST NOT
 * import any Node-only modules (fs, path, DB, etc.) at the top level — those
 * would fail to bundle for Edge. The actual scheduler lives in
 * `./instrumentation-node.ts` and is loaded via a dynamic import guarded by
 * `process.env.NEXT_RUNTIME === 'nodejs'`. Next.js special-cases that pattern
 * so the Edge bundle never analyses the node file.
 *
 * Scheduler behaviour (see instrumentation-node.ts):
 *   - Enabled only when `TRANSCRIPTION_EXPORT_INTERVAL_MINUTES` is set to a
 *     positive integer (e.g. `20`). Unset or `0` = disabled.
 *   - Only runs in the Node.js runtime (skipped on Edge).
 *   - Guarded by a `globalThis` flag so dev HMR / repeated bundle loads never
 *     spawn duplicate intervals.
 *   - First run is delayed by up to 1 minute after boot so the app has time
 *     to finish warming up before touching the DB + Graph API.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTranscriptionAutoExportScheduler } = await import(
      "./instrumentation-node"
    );
    startTranscriptionAutoExportScheduler();
  }
}
