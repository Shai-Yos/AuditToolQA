import { buildUserRolesFromJson } from "@/server/lib/roomRoles";

const LOCK_TTL_MS = 30_000;

type PermissionInput = {
  userId: string;
  userRole: string;
  auditCreatedById: string | null;
  roomRolesJson: string | null;
  requestLabels: string[];
};

export function canForceUnlockRequest(input: PermissionInput): boolean {
  const { userId, userRole, auditCreatedById, roomRolesJson } = input;

  if (userRole === "ADMIN") return true;
  if (userRole === "AUDIT_OWNER" && auditCreatedById === userId) return true;

  if (!roomRolesJson) return false;

  try {
    return buildUserRolesFromJson(roomRolesJson).has(userId);
  } catch {
    return false;
  }
}

function isLockFresh(lockedAt: Date | null): boolean {
  if (!lockedAt) return false;
  return Date.now() - lockedAt.getTime() < LOCK_TTL_MS;
}

export function canUserEditWithLock(lock: { lockedBy: string | null; lockedAt: Date | null }, userId: string): boolean {
  return lock.lockedBy === userId && isLockFresh(lock.lockedAt);
}

export function lockDeniedMessage(lockOwnerName: string | null | undefined): string {
  const owner = (lockOwnerName ?? "another user").trim() || "another user";
  return `This request is locked by ${owner}. Please refresh and try again.`;
}
