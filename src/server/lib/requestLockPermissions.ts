import { buildUserRolesFromJson } from "@/server/lib/roomRoles";

const LOCK_TTL_MS = 30_000;

type PermissionInput = {
  userId: string;
  userRole: string;
  auditCreatedById: string;
  roomRolesJson: string | null;
  requestLabels: string[];
};

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((v) => Number.isFinite(v) && v > 0)));
}

function parseFrLabels(labels: string[]): number[] {
  const indices = labels.flatMap((label) => {
    const match = /^FR(\d+)$/i.exec(label.trim());
    return match ? [parseInt(match[1]!, 10)] : [];
  });
  return uniqueNumbers(indices);
}

function parseLeadIndices(roleString: string, prefix: "FR" | "BR"): number[] {
  const regex = new RegExp(`\\b${prefix}(\\d+)\\s+Lead\\b`, "gi");
  const matches = Array.from(roleString.matchAll(regex));
  return uniqueNumbers(matches.map((m) => parseInt(m[1]!, 10)));
}

function frIndicesConnectedToBrLeads(roomRolesJson: string, brLeadIndices: number[]): number[] {
  if (brLeadIndices.length === 0) return [];
  try {
    const parsed = JSON.parse(roomRolesJson) as {
      br?: Array<{ brIndex: number; connectedFrIndices?: number[] }>;
    };
    const connected: number[] = [];
    for (const brIdx of brLeadIndices) {
      const br = parsed.br?.find((entry) => entry.brIndex === brIdx);
      for (const frIdx of br?.connectedFrIndices ?? []) {
        connected.push(frIdx);
      }
    }
    return uniqueNumbers(connected);
  } catch {
    return [];
  }
}

export function canForceUnlockRequest(input: PermissionInput): boolean {
  const { userId, userRole, auditCreatedById, roomRolesJson, requestLabels } = input;

  if (userRole === "ADMIN") return true;
  if (userRole === "AUDIT_OWNER" && auditCreatedById === userId) return true;

  const requestFrIndices = parseFrLabels(requestLabels);
  if (requestFrIndices.length === 0 || !roomRolesJson) return false;

  let roleString = "";
  try {
    roleString = buildUserRolesFromJson(roomRolesJson).get(userId) ?? "";
  } catch {
    return false;
  }
  if (!roleString) return false;

  const frLeadIndices = parseLeadIndices(roleString, "FR");
  if (requestFrIndices.some((fr) => frLeadIndices.includes(fr))) return true;

  const brLeadIndices = parseLeadIndices(roleString, "BR");
  const connectedFrIndices = frIndicesConnectedToBrLeads(roomRolesJson, brLeadIndices);
  return requestFrIndices.some((fr) => connectedFrIndices.includes(fr));
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
