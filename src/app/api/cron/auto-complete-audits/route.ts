import { NextResponse } from "next/server";
import { autoCompleteExpiredAudits } from "@/server/helpers/autoCompleteAudits";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/auto-complete-audits
 * Can be called by an external scheduler (e.g. Azure Timer Trigger, cron job, Vercel cron).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await autoCompleteExpiredAudits();

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
