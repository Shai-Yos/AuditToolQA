import { db } from "@/server/db";
import { NextResponse } from "next/server";

/**
 * Returns the most recent change timestamp for a specific audit (including the audit itself
 * and all its requests). Used by the audit workspace to detect when to refresh.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  const [audit, latestRequest] = await Promise.all([
    db.audit.findUnique({
      where: { id: auditId },
      select: { updatedAt: true },
    }),
    db.request.findFirst({
      where: { auditId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const times = [audit?.updatedAt, latestRequest?.updatedAt]
    .filter(Boolean)
    .map((d) => d!.getTime());

  const latest = times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;

  return NextResponse.json({ updatedAt: latest });
}
