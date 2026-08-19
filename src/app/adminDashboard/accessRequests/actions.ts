"use server";

import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { invalidateUserCache } from "@/server/lib/userPrivilegeCache";
import { logActivity } from "@/server/helpers/logActivity";
import { revalidatePath } from "next/cache";
import { emitUserEvent } from "@/server/lib/event-bus";

function generateId() {
  return crypto.randomUUID().replace(/-/g, "");
}

const VALID_ROLES = ["ADMIN", "AUDIT_OWNER", "USER"] as const;
type AppRole = (typeof VALID_ROLES)[number];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  AUDIT_OWNER: "Audit Owner",
  USER: "User",
};

function isPoolTimeoutError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2024";
}

export async function reviewAccessRequest(input: {
  requestId: string;
  action: "APPROVE" | "REJECT";
  approvedRole?: string;
  reviewNote?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const reviewer = await requireUser();
    if (reviewer.role !== "ADMIN") {
      return { success: false, error: "Only admins can review access requests" };
    }

    const request = await db.accessRequest.findUnique({
      where: { id: input.requestId },
    });

    if (!request) return { success: false, error: "Request not found" };
    if (request.status !== "PENDING") {
      return { success: false, error: "Request has already been reviewed" };
    }

    if (input.action === "APPROVE") {
      const role = (input.approvedRole ?? request.requestedRole) as AppRole;
      if (!VALID_ROLES.includes(role)) {
        return { success: false, error: "Invalid role" };
      }

      // Activate or create the user
      const existing = await db.user.findUnique({
        where: { email: request.email },
        select: { id: true },
      });

      let userId: string;
      if (existing) {
        await db.user.update({
          where: { id: existing.id },
          data: { isActive: true, role },
        });
        invalidateUserCache(existing.id);
        userId = existing.id;
      } else {
        // Pre-create so they can sign in — id will be overwritten with Azure OID on first sign-in
        const newUser = await db.user.create({
          data: {
            id: generateId(),
            email: request.email,
            name: request.name,
            role,
            isActive: true,
          },
          select: { id: true },
        });
        userId = newUser.id;
      }

      await db.accessRequest.update({
        where: { id: input.requestId },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: reviewer.id,
          reviewedByName: reviewer.name ?? reviewer.email ?? "",
          reviewNote: input.reviewNote?.trim() || null,
        },
      });

      await logActivity({
        type: "ACCESS_REQUEST_APPROVED",
        actorName: reviewer.name ?? reviewer.email ?? "Admin",
        targetId: input.requestId,
        targetTitle: request.name,
        meta: {
          email: request.email,
          grantedRole: ROLE_LABELS[role] ?? role,
        },
        notifyUserIds: [userId],
      });
      emitUserEvent(userId, "role");
    } else {
      await db.accessRequest.update({
        where: { id: input.requestId },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedById: reviewer.id,
          reviewedByName: reviewer.name ?? reviewer.email ?? "",
          reviewNote: input.reviewNote?.trim() || null,
        },
      });

      // Notify the requester only if they already have an account (e.g. a
      // role-change request). New signups won't have a User row yet.
      let existingUser: { id: string } | null = null;
      try {
        existingUser = await db.user.findUnique({
          where: { email: request.email },
          select: { id: true },
        });
      } catch (error) {
        if (!isPoolTimeoutError(error)) throw error;
        // Under pool pressure, skip requester notification lookup so the
        // primary reject operation still succeeds.
      }

      await logActivity({
        type: "ACCESS_REQUEST_REJECTED",
        actorName: reviewer.name ?? reviewer.email ?? "Admin",
        targetId: input.requestId,
        targetTitle: request.name,
        meta: {
          email: request.email,
          requestedRole: ROLE_LABELS[request.requestedRole] ?? request.requestedRole,
        },
        notifyUserIds: existingUser ? [existingUser.id] : [],
      });
    }

    revalidatePath("/adminDashboard/accessRequests");
    return { success: true };
  } catch (err) {
    if (isPoolTimeoutError(err)) {
      return {
        success: false,
        error: "Database is busy right now. Please retry in a few seconds.",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
