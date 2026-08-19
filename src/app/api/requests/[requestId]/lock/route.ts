import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";

const LOCK_TTL_MS = 30_000; // lock expires after 30s without a heartbeat

function isLockFresh(lockedAt: Date | null): boolean {
  if (!lockedAt) return false;
  return Date.now() - lockedAt.getTime() < LOCK_TTL_MS;
}

function isPoolTimeoutError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2024";
}

// GET — check lock status without acquiring
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { lockedBy: true, lockedByName: true, lockedAt: true },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const locked = !!request.lockedBy && request.lockedBy !== user.id && isLockFresh(request.lockedAt);
  return NextResponse.json({
    locked,
    lockedByName: locked ? request.lockedByName : null,
  });
}

// POST — acquire lock
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const body = (await req.json()) as { userName?: string };
  const userName = body.userName ?? user.name ?? user.email ?? user.id;

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { lockedBy: true, lockedByName: true, lockedAt: true },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If someone else holds a fresh lock, reject
  if (request.lockedBy && request.lockedBy !== user.id && isLockFresh(request.lockedAt)) {
    return NextResponse.json(
      { error: "locked", lockedByName: request.lockedByName },
      { status: 409 }
    );
  }

  // Acquire (or re-acquire) the lock
  await db.request.update({
    where: { id: requestId },
    data: { lockedBy: user.id, lockedByName: userName, lockedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// PATCH — heartbeat (keep lock alive)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  try {
    // Single-query heartbeat to reduce connection pressure under heavy concurrency.
    const result = await db.request.updateMany({
      where: { id: requestId, lockedBy: user.id },
      data: { lockedAt: new Date() },
    });

    if (result.count > 0) {
      return NextResponse.json({ ok: true });
    }

    const request = await db.request.findUnique({
      where: { id: requestId },
      select: { id: true },
    });
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "Not your lock" }, { status: 403 });
  } catch (error) {
    if (isPoolTimeoutError(error)) {
      return NextResponse.json({ error: "Database busy, retry shortly" }, { status: 503 });
    }
    throw error;
  }
}

// DELETE — release lock
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { lockedBy: true },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Only release if you own the lock
  if (request.lockedBy === user.id) {
    await db.request.update({
      where: { id: requestId },
      data: { lockedBy: null, lockedByName: null, lockedAt: null },
    });
  }

  return NextResponse.json({ ok: true });
}
