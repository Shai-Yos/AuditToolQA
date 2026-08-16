import { auth } from "@/auth";
import { db } from "@/server/db";
import { getCachedUser, primeUserCache } from "@/server/lib/userPrivilegeCache";
import { hasRegulatoryImplementationAccess } from "@/server/lib/regulatoryImplementationAccess";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Try in-memory cache first (avoids DB hit for ~5 min)
  const cached = await getCachedUser(session.user.id);
  if (cached) return cached;

  // Fallback: query DB and prime cache
  const user = await db.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    throw new Error("User not found");
  }

  primeUserCache({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "ADMIN" | "AUDIT_OWNER" | "USER",
    image: user.image,
    createdAt: user.createdAt,
  });

  return user;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  if (session.user.role !== "ADMIN") {
    throw new Error("Admin access required");
  }
  return requireUser();
}

export async function requireAuditOwner() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  if (session.user.role !== "AUDIT_OWNER") {
    throw new Error("Audit owner access required");
  }
  return requireUser();
}

/**
 * Requires the signed-in user to be a member of the Azure AD group granting
 * access to the Regulatory Implementation of Lessons Learned library.
 * Any authenticated role (ADMIN/AUDIT_OWNER/USER) may pass this check —
 * access is controlled purely by group membership, not by app role.
 */
export async function requireRegulatoryImplementationAccess() {
  const user = await requireUser();
  const allowed = await hasRegulatoryImplementationAccess(user.id);
  if (!allowed) {
    throw new Error("Regulatory implementation access required");
  }
  return user;
}