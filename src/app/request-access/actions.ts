"use server";

import { db } from "@/server/db";
import { logActivity } from "@/server/helpers/logActivity";

const VALID_ROLES = ["ADMIN", "AUDIT_OWNER", "USER"] as const;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  AUDIT_OWNER: "Audit Owner",
  USER: "User",
};

export async function submitAccessRequest(input: {
  email: string;
  name: string;
  requestedRole: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const reason = input.reason?.trim() ?? "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: "Invalid email address" };
    }
    if (!name) {
      return { success: false, error: "Name is required" };
    }
    if (!reason) {
      return { success: false, error: "Reason is required" };
    }
    if (!VALID_ROLES.includes(input.requestedRole as (typeof VALID_ROLES)[number])) {
      return { success: false, error: "Invalid role" };
    }

    // Cancel any previous PENDING requests for this email
    await db.accessRequest.updateMany({
      where: { email, status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    const created = await db.accessRequest.create({
      data: {
        id: crypto.randomUUID(),
        email,
        name,
        requestedRole: input.requestedRole,
        reason,
        status: "PENDING",
      },
    });

    // Log activity + notify all admins.
    // Note: the requester may not have a User record yet, so we pass the
    // display name as the actor. logActivity will fetch admin recipients.
    await logActivity({
      type: "ACCESS_REQUEST_SUBMITTED",
      actorName: name,
      targetId: created.id,
      targetTitle: name,
      meta: {
        email,
        requestedRole: ROLE_LABELS[input.requestedRole] ?? input.requestedRole,
      },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to submit request",
    };
  }
}
