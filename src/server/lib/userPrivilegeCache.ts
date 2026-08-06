import { db } from "@/server/db";

/**
 * In-memory cache for user records and audit privilege data.
 * TTL: 5 minutes. Avoids hitting the DB on every chat request.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ─── User record cache ───────────────────────────────────────────────

type CachedUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: "ADMIN" | "AUDIT_OWNER" | "USER";
  image: string | null;
  createdAt: Date;
};

const userCache = new Map<string, CacheEntry<CachedUser>>();

export async function getCachedUser(userId: string): Promise<CachedUser | null> {
  const entry = userCache.get(userId);
  if (entry && Date.now() < entry.expiresAt) return entry.data;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const cached: CachedUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "ADMIN" | "AUDIT_OWNER" | "USER",
    image: user.image,
    createdAt: user.createdAt,
  };
  userCache.set(userId, { data: cached, expiresAt: Date.now() + CACHE_TTL_MS });
  return cached;
}

export function primeUserCache(user: CachedUser): void {
  userCache.set(user.id, { data: user, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

// ─── Audit privilege cache ───────────────────────────────────────────

export type CachedAuditPrivilege = {
  assignee: { role: string } | null;
  auditTitle: string;
  roomRolesJson: string | null;
  createdById: string | null;
};

const auditPrivilegeCache = new Map<string, CacheEntry<CachedAuditPrivilege>>();

function auditKey(userId: string, auditId: string) {
  return `${userId}:${auditId}`;
}

export async function getCachedAuditPrivilege(
  userId: string,
  auditId: string,
): Promise<CachedAuditPrivilege> {
  const key = auditKey(userId, auditId);
  const entry = auditPrivilegeCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;

  const [assignee, audit] = await Promise.all([
    db.auditAssignee.findUnique({
      where: { auditId_userId: { auditId, userId } },
      select: { role: true },
    }),
    db.audit.findUnique({
      where: { id: auditId },
      select: { title: true, roomRolesJson: true, createdById: true },
    }),
  ]);

  const cached: CachedAuditPrivilege = {
    assignee,
    auditTitle: audit?.title ?? "",
    roomRolesJson: (audit?.roomRolesJson as string) ?? null,
    createdById: audit?.createdById ?? null,
  };
  auditPrivilegeCache.set(key, { data: cached, expiresAt: Date.now() + CACHE_TTL_MS });
  return cached;
}

export function invalidateAuditPrivilege(userId: string, auditId: string): void {
  auditPrivilegeCache.delete(auditKey(userId, auditId));
}

// ─── Periodic cleanup to prevent memory leaks ────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userCache) {
    if (now >= entry.expiresAt) userCache.delete(key);
  }
  for (const [key, entry] of auditPrivilegeCache) {
    if (now >= entry.expiresAt) auditPrivilegeCache.delete(key);
  }
}, 10 * 60 * 1000).unref();
