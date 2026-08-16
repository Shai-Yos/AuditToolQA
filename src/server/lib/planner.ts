import "server-only";

import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";

import { db } from "@/server/db";
import { env } from "@/env";

type PlannerRequest = {
  id: string;
  trackNumber: string | null;
  title: string;
  auditTitle: string;
  labels: string;
  estimatedDeliveryDate: Date | null;
};

type DelegatedToken = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
};

function plannerEnabled(): boolean {
  return env.PLANNER_SYNC_ENABLED === "true" && Boolean(env.PLANNER_PLAN_ID);
}

async function getDelegatedGraphToken(): Promise<string> {
  const authBaseUrl = env.AUTH_URL ?? env.NEXTAUTH_URL;
  const secureCookie = authBaseUrl ? new URL(authBaseUrl).protocol === "https:" : env.NODE_ENV === "production";
  const requestCookies = await cookies();
  const token = (await getToken({
    req: { headers: { cookie: requestCookies.toString() } },
    secret: env.AUTH_SECRET,
    secureCookie,
  })) as DelegatedToken | null;

  if (!token?.accessToken) {
    throw new Error("No delegated Microsoft Graph token is available. Please sign out and sign in again.");
  }

  // A request can be created after the one-hour access token lifetime. Refresh
  // it in memory; the original encrypted session remains the source of truth.
  if (!token.accessTokenExpiresAt || token.accessTokenExpiresAt > Date.now() + 60_000) {
    return token.accessToken;
  }
  if (!token.refreshToken) {
    throw new Error("The Microsoft Graph token has expired. Please sign out and sign in again.");
  }

  const refreshResponse = await fetch(
    `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.AZURE_AD_CLIENT_ID,
        client_secret: env.AZURE_AD_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    },
  );
  if (!refreshResponse.ok) {
    throw new Error("Unable to refresh the Microsoft Graph token. Please sign out and sign in again.");
  }
  const refreshed = (await refreshResponse.json()) as { access_token: string };
  return refreshed.access_token;
}

function taskTitle(request: PlannerRequest): string {
  return request.trackNumber ? `${request.trackNumber}` : request.title;
}

function taskDescription(request: PlannerRequest): string {
  const labels = (() => {
    try {
      const parsed = JSON.parse(request.labels) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  })();
  return [
    `Audit: ${request.auditTitle || "Not specified"}`,
    `Request: ${request.title}`,
    ...(labels.length ? [`Labels: ${labels.join(", ")}`] : []),
  ].join("\n");
}

async function addTaskDescription(accessToken: string, taskId: string, description: string): Promise<void> {
  const detailsUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(taskId)}/details`;
  const detailsResponse = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!detailsResponse.ok) return;

  const details = (await detailsResponse.json()) as { "@odata.etag"?: string };
  if (!details["@odata.etag"]) return;

  await fetch(detailsUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "If-Match": details["@odata.etag"],
    },
    body: JSON.stringify({ description }),
  });
}

/**
 * Mirrors one newly-created audit request to the configured Planner plan.
 * Planner configuration is intentionally opt-in so deployment can precede
 * permission consent without disrupting request creation.
 */
export async function syncNewRequestToPlanner(request: PlannerRequest): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const accessToken = await getDelegatedGraphToken();
    const response = await fetch("https://graph.microsoft.com/v1.0/planner/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        planId: env.PLANNER_PLAN_ID,
        ...(env.PLANNER_BUCKET_ID ? { bucketId: env.PLANNER_BUCKET_ID } : {}),
        title: taskTitle(request),
        ...(request.estimatedDeliveryDate ? { dueDateTime: request.estimatedDeliveryDate.toISOString() } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph returned ${response.status}: ${await response.text()}`);
    }
    const plannerTask = (await response.json()) as { id: string };
    await db.request.update({
      where: { id: request.id },
      data: { plannerTaskId: plannerTask.id, plannerSyncedAt: new Date(), plannerSyncError: null },
    });

    // Planner stores the task description in a separate details resource.
    // A description failure never rolls back the already-created Planner task.
    await addTaskDescription(accessToken, plannerTask.id, taskDescription(request));
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 2000) : "Unknown Planner synchronization error";
    await db.request.update({
      where: { id: request.id },
      data: { plannerSyncError: detail },
    });
    console.error(`Planner sync failed for request ${request.id}:`, error);
  }
}
