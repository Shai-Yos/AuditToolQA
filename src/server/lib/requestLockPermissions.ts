import { buildUserRolesFromJson } from "@/server/lib/roomRoles";

const LOCK_TTL_MS = 30_000;

type PermissionInput = {
  userId: string;
  userRole: string;
  auditCreatedById: string | null;
  roomRolesJson: string | null;
  requestLabels: string[];
};

function hasFrOrBrLeadRole(roleString: string): boolean {
  return /\b(?:FR|BR)\d+\s+Lead\b/i.test(roleString);
}

export function canForceUnlockRequest(input: PermissionInput): boolean {
  const { userId, userRole, auditCreatedById, roomRolesJson } = input;

  if (userRole === "ADMIN") return true;
  if (userRole === "AUDIT_OWNER" && auditCreatedById === userId) return true;

  if (!roomRolesJson) return false;

  try {
    const roleString = buildUserRolesFromJson(roomRolesJson).get(userId) ?? "";
    if (!roleString) return false;

    if (userRole === "AUDIT_OWNER") {
      return hasFrOrBrLeadRole(roleString);
    }

    return true;
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
