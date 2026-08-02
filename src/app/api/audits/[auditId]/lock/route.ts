import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";

const LOCK_TTL_MS = 30_000; // lock expires after 30s without a heartbeat

function isLockFresh(lockedAt: Date | null): boolean {
  if (!lockedAt) return false;
  return Date.now() - lockedAt.getTime() < LOCK_TTL_MS;
}

// GET — check lock status without acquiring
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  const { auditId } = await params;
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { lockedBy: true, lockedByName: true, lockedAt: true },
  });

  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const locked = !!audit.lockedBy && audit.lockedBy !== user.id && isLockFresh(audit.lockedAt);
  return NextResponse.json({
    locked,
    lockedByName: locked ? audit.lockedByName : null,
  });
}

// POST — acquire lock
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  const { auditId } = await params;
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const body = (await req.json()) as { userName?: string };
  const userName = body.userName ?? user.name ?? user.email ?? user.id;

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { lockedBy: true, lockedByName: true, lockedAt: true },
  });

  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If someone else holds a fresh lock, reject
  if (audit.lockedBy && audit.lockedBy !== user.id && isLockFresh(audit.lockedAt)) {
    return NextResponse.json(
      { error: "locked", lockedByName: audit.lockedByName },
      { status: 409 }
    );
  }

  // Acquire (or re-acquire) the lock
  await db.audit.update({
    where: { id: auditId },
    data: { lockedBy: user.id, lockedByName: userName, lockedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// PATCH — heartbeat (keep lock alive)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  const { auditId } = await params;
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { lockedBy: true },
  });

  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (audit.lockedBy !== user.id) return NextResponse.json({ error: "Not your lock" }, { status: 403 });

  await db.audit.update({
    where: { id: auditId },
    data: { lockedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — release lock
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  const { auditId } = await params;
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { lockedBy: true },
  });

  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Only release if you own the lock
  if (audit.lockedBy === user.id) {
    await db.audit.update({
      where: { id: auditId },
      data: { lockedBy: null, lockedByName: null, lockedAt: null },
    });
  }

  return NextResponse.json({ ok: true });
}

