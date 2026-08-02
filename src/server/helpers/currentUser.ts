import { auth } from "@/auth";
import { db } from "@/server/db";
import { getCachedUser, primeUserCache } from "@/server/lib/userPrivilegeCache";

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