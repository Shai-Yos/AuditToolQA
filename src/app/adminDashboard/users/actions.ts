"use server";

import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { invalidateUserCache } from "@/server/lib/userPrivilegeCache";
import { setUserAzureGroupRole, getAzureOidByEmail } from "@/server/lib/graphClient";
import { revalidatePath } from "next/cache";
import { emitUserEvent } from "@/server/lib/event-bus";

const VALID_ROLES = ["ADMIN", "AUDIT_OWNER", "USER"] as const;
type AppRole = (typeof VALID_ROLES)[number];

export async function changeUserRole(
  userId: string,
  newRole: AppRole
): Promise<{ success: boolean; error?: string }> {
  try {
    // Only ADMINs can change roles
    const caller = await requireUser();
    if (caller.role !== "ADMIN") {
      return { success: false, error: "Only admins can change user roles" };
    }

    if (!VALID_ROLES.includes(newRole)) {
      return { success: false, error: "Invalid role" };
    }

    if (!userId || typeof userId !== "string") {
      return { success: false, error: "Invalid user ID" };
    }

    // Sync Azure AD group membership first — if this fails, we don't touch the DB
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
    if (!user?.email) return { success: false, error: "User not found" };

    const currentRole = VALID_ROLES.includes(user.role as AppRole) ? (user.role as AppRole) : "USER";
    const azureOid = await getAzureOidByEmail(user.email);
    if (!azureOid) return { success: false, error: "Azure user not found for this email" };

    await setUserAzureGroupRole(azureOid, currentRole, newRole);

    // Azure update succeeded — now persist the role in the DB
    await db.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    invalidateUserCache(userId);
    emitUserEvent(userId, "role");
    revalidatePath("/adminDashboard/users");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function addMember(input: {
  azureId: string;
  name: string;
  email: string;
  role: AppRole;
  image?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const caller = await requireUser();
    if (caller.role !== "ADMIN") {
      return { success: false, error: "Only admins can add members" };
    }

    if (!VALID_ROLES.includes(input.role)) {
      return { success: false, error: "Invalid role" };
    }

    if (!input.azureId || !input.email) {
      return { success: false, error: "Invalid user data" };
    }

    // Check if user already exists (by Azure OID or email)
    const existing = await db.user.findFirst({
      where: { OR: [{ id: input.azureId }, { email: input.email }] },
      select: { id: true, role: true },
    });

    const currentRole: AppRole = existing
      ? VALID_ROLES.includes(existing.role as AppRole)
        ? (existing.role as AppRole)
        : "USER"
      : "USER";

    // Sync Azure AD group membership
    await setUserAzureGroupRole(input.azureId, currentRole, input.role);

    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: {
          role: input.role,
          name: input.name,
          ...(input.image ? { image: input.image } : {}),
        },
      });
      invalidateUserCache(existing.id);
    } else {
      await db.user.create({
        data: {
          id: input.azureId,
          name: input.name,
          email: input.email,
          role: input.role,
          ...(input.image ? { image: input.image } : {}),
        },
      });
    }

    revalidatePath("/adminDashboard/users");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function setUserActive(
  userId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const caller = await requireUser();
    if (caller.role !== "ADMIN") {
      return { success: false, error: "Only admins can change user status" };
    }

    if (!userId || typeof userId !== "string") {
      return { success: false, error: "Invalid user ID" };
    }

    await db.user.update({
      where: { id: userId },
      data: { isActive },
    });

    invalidateUserCache(userId);
    emitUserEvent(userId, "role");
    revalidatePath("/adminDashboard/users");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

