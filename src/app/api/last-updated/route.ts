import { db } from "@/server/db";
import { NextResponse } from "next/server";

/**
 * Returns the most recent change timestamp + audit count across the entire app.
 * Count change catches deletions (deleted records have no updatedAt to compare).
 */
export async function GET() {
  const [latestAudit, latestRequest, auditCount, requestCount] = await Promise.all([
    db.audit.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    db.request.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    db.audit.count(),
    db.request.count(),
  ]);

  const times = [latestAudit?.updatedAt, latestRequest?.updatedAt]
    .filter(Boolean)
    .map((d) => d!.getTime());

  const latest = times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;

  return NextResponse.json({ updatedAt: latest, auditCount, requestCount });
}
