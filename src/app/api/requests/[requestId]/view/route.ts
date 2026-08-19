import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "~/server/helpers/currentUser";
import { db } from "~/server/db";

const LOCK_TTL_MS = 30_000;

function isLockFresh(lockedAt: Date | null): boolean {
  if (!lockedAt) return false;
  return Date.now() - lockedAt.getTime() < LOCK_TTL_MS;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const user = await requireUser();

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { auditId: true, lockedBy: true, lockedByName: true, lockedAt: true },
  });

  if (!request) {
    return NextResponse.redirect(new URL("/", _req.url));
  }

  const dashBase =
    user.role === "ADMIN"
      ? "adminDashboard"
      : user.role === "AUDIT_OWNER"
        ? "auditOwnerDashboard"
        : "userDashboard";
  const destination = `/${dashBase}/audits/${request.auditId}/requests/${requestId}`;

  // If locked by someone else, show a lock warning page instead of redirecting
  const lockedByOther =
    !!request.lockedBy &&
    request.lockedBy !== user.id &&
    isLockFresh(request.lockedAt);

  if (lockedByOther) {
    // Let the request page open in read-only mode when another user owns the lock.
    return NextResponse.redirect(new URL(destination, _req.url));
  }

  return NextResponse.redirect(new URL(destination, _req.url));
}
