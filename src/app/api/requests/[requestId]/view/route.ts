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

  const dashBase = user.role === "ADMIN" ? "adminDashboard" : "userDashboard";
  const destination = `/${dashBase}/audits/${request.auditId}/requests/${requestId}`;

  // If locked by someone else, show a lock warning page instead of redirecting
  const lockedByOther =
    !!request.lockedBy &&
    request.lockedBy !== user.id &&
    isLockFresh(request.lockedAt);

  if (lockedByOther) {
    const lockedByName = request.lockedByName ?? "Another user";
    const backUrl = `/${dashBase}/audits/${request.auditId}/chats`;
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Request Locked</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif}
  .card{max-width:400px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:2rem;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  h2{color:#92400e;font-size:1.125rem;margin:0 0 .5rem}
  p{color:#b45309;font-size:.875rem;margin:.25rem 0}
  .icon{font-size:2.5rem;margin-bottom:.75rem}
  .name{font-weight:600}
  a{display:inline-block;margin-top:1rem;padding:.5rem 1.25rem;background:#f59e0b;color:#fff;border-radius:8px;text-decoration:none;font-size:.875rem;font-weight:500}
  a:hover{background:#d97706}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h2>Request Is Currently Being Edited</h2>
    <p>This request is locked by <span class="name">${lockedByName.replace(/[<>&"'/]/g, "")}</span>.</p>
    <p>Please try again later.</p>
    <a href="${backUrl}">Back to Chats</a>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return NextResponse.redirect(new URL(destination, _req.url));
}
