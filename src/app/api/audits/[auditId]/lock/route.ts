import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { getCachedAuditPrivilege } from "@/server/lib/userPrivilegeCache";
import { buildUserRolesFromJson, transcriptionFrIndicesFromRole } from "@/server/lib/roomRoles";
import { emitAuditEvent } from "@/server/lib/event-bus";

const LOCK_TTL_MS = 30_000; // lock expires after 30s without a heartbeat

function isLockFresh(lockedAt: Date | null): boolean {
  if (!lockedAt) return false;
  return Date.now() - lockedAt.getTime() < LOCK_TTL_MS;
}

function canForceUnlockAudit(userRole: string, effectiveRole: string): boolean {
  if (userRole === "ADMIN") return true;
  return transcriptionFrIndicesFromRole(effectiveRole).length > 0;
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

  emitAuditEvent(auditId, "lock");

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
    select: { lockedBy: true, lockedByName: true, createdById: true, roomRolesJson: true },
  });

  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const force = _req.nextUrl.searchParams.get("force") === "1";

  if (audit.lockedBy === user.id) {
    await db.audit.update({
      where: { id: auditId },
      data: { lockedBy: null, lockedByName: null, lockedAt: null },
    });
    emitAuditEvent(auditId, "lock");
    return NextResponse.json({ ok: true });
  }

  if (!force) {
    return NextResponse.json({ ok: true });
  }

  const privilege = await getCachedAuditPrivilege(user.id, auditId);
  const effectiveRole = audit.roomRolesJson
    ? buildUserRolesFromJson(audit.roomRolesJson).get(user.id) ?? privilege.assignee?.role ?? ""
    : privilege.assignee?.role ?? "";

  if (!canForceUnlockAudit(user.role, effectiveRole)) {
    return NextResponse.json({ error: "Not allowed to force unlock" }, { status: 403 });
  }

  await db.audit.update({
    where: { id: auditId },
    data: { lockedBy: null, lockedByName: null, lockedAt: null },
  });

  emitAuditEvent(auditId, "lock");

  return NextResponse.json({ ok: true });
}

