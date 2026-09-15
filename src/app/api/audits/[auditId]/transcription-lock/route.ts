import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { getCachedAuditPrivilege } from "@/server/lib/userPrivilegeCache";
import { buildUserRolesFromJson, canAccessTranscription, transcriptionFrIndicesFromRole } from "@/server/lib/roomRoles";
import { emitAuditEvent } from "@/server/lib/event-bus";
import {
  acquireTranscriptionLock,
  forceReleaseTranscriptionLock,
  getTranscriptionLock,
  heartbeatTranscriptionLock,
  isLockFresh,
  releaseTranscriptionLock,
} from "@/server/lib/transcriptionLock";

function canForceUnlockTranscription(userRole: string, effectiveRole: string): boolean {
  if (userRole === "ADMIN") return true;
  return transcriptionFrIndicesFromRole(effectiveRole).length > 0;
}

function parseFrIndex(channel: string): number | null {
  if (!channel.endsWith("-transcription")) return null;
  const frNum = Number.parseInt(channel.replace("fr", "").replace("-transcription", ""), 10);
  return Number.isFinite(frNum) ? frNum : null;
}

async function getEffectiveRole(auditId: string, userId: string) {
  const privilege = await getCachedAuditPrivilege(userId, auditId);
  return {
    privilege,
    effectiveRole: privilege.roomRolesJson
      ? buildUserRolesFromJson(privilege.roomRolesJson).get(userId) ?? privilege.assignee?.role ?? ""
      : privilege.assignee?.role ?? "",
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const channel = req.nextUrl.searchParams.get("channel") ?? "";
  const frIndex = parseFrIndex(channel);
  if (!channel || frIndex === null) return NextResponse.json({ error: "channel is required" }, { status: 400 });

  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { effectiveRole } = await getEffectiveRole(auditId, user.id);
  if (user.role !== "ADMIN" && !canAccessTranscription(effectiveRole, frIndex)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lock = await getTranscriptionLock(auditId, channel);
  const owned = !!lock?.lockedBy && lock.lockedBy === user.id && isLockFresh(lock.lockedAt);
  const locked = !!lock?.lockedBy && lock.lockedBy !== user.id && isLockFresh(lock.lockedAt);
  return NextResponse.json({
    owned,
    locked,
    lockedByName: locked ? lock?.lockedByName ?? null : null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const channel = req.nextUrl.searchParams.get("channel") ?? "";
  const frIndex = parseFrIndex(channel);
  if (!channel || frIndex === null) return NextResponse.json({ error: "channel is required" }, { status: 400 });

  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const body = (await req.json().catch(() => ({}))) as { userName?: string };
  const userName = body.userName ?? user.name ?? user.email ?? user.id;

  const { effectiveRole } = await getEffectiveRole(auditId, user.id);
  if (user.role !== "ADMIN" && !canAccessTranscription(effectiveRole, frIndex)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lock = await getTranscriptionLock(auditId, channel);
  if (lock && lock.lockedBy && lock.lockedBy !== user.id && isLockFresh(lock.lockedAt)) {
    return NextResponse.json({ error: "locked", lockedByName: lock.lockedByName }, { status: 409 });
  }

  await acquireTranscriptionLock(auditId, channel, user.id, userName);
  emitAuditEvent(auditId, "lock");
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const channel = req.nextUrl.searchParams.get("channel") ?? "";
  const frIndex = parseFrIndex(channel);
  if (!channel || frIndex === null) return NextResponse.json({ error: "channel is required" }, { status: 400 });

  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { effectiveRole } = await getEffectiveRole(auditId, user.id);
  if (user.role !== "ADMIN" && !canAccessTranscription(effectiveRole, frIndex)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ok = await heartbeatTranscriptionLock(auditId, channel, user.id);
  if (!ok) return NextResponse.json({ error: "Not your lock" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const channel = req.nextUrl.searchParams.get("channel") ?? "";
  const frIndex = parseFrIndex(channel);
  if (!channel || frIndex === null) return NextResponse.json({ error: "channel is required" }, { status: 400 });

  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { privilege, effectiveRole } = await getEffectiveRole(auditId, user.id);
  if (user.role !== "ADMIN" && !canAccessTranscription(effectiveRole, frIndex)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lock = await getTranscriptionLock(auditId, channel);
  if (!lock?.lockedBy) return NextResponse.json({ ok: true });

  if (lock.lockedBy === user.id) {
    const released = await releaseTranscriptionLock(auditId, channel, user.id);
    if (released) emitAuditEvent(auditId, "lock");
    return NextResponse.json({ ok: true });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force) return NextResponse.json({ ok: true });

  if (!canForceUnlockTranscription(user.role, effectiveRole)) {
    return NextResponse.json({ error: "Not allowed to force unlock" }, { status: 403 });
  }

  await forceReleaseTranscriptionLock(auditId, channel);
  emitAuditEvent(auditId, "lock");
  return NextResponse.json({ ok: true });
}
