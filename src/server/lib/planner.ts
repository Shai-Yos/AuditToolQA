import "server-only";

import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";

import { db } from "@/server/db";
import { env } from "@/env";
import { getOneDriveWebUrl } from "@/server/lib/oneDriveClient";

type PlannerRequest = {
  id: string;
  trackNumber: string | null;
  title: string;
  auditTitle: string;
  labels: string;
  isFormal: boolean;
  estimatedDeliveryDate: Date | null;
};

type DelegatedToken = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
};

function plannerEnabled(): boolean {
  return Boolean(env.PLANNER_PLAN_ID?.trim()) && Boolean(env.PLANNER_BUCKET_ID?.trim());
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

export { getDelegatedGraphToken };

function taskTitle(request: PlannerRequest): string {
  return request.trackNumber ? `${request.trackNumber}` : request.title;
}

function parseLabels(labelsJson: string, isFormal: boolean): string[] {
  try {
    const parsed = JSON.parse(labelsJson) as unknown;
    const base = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    return [isFormal ? "Formal" : "Informal", ...base];
  } catch {
    return [isFormal ? "Formal" : "Informal"];
  }
}

function taskDescription(request: PlannerRequest): string {
  const labels = parseLabels(request.labels, request.isFormal);
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

// Planner supports up to 25 category slots per plan (category1..category25).
const CATEGORY_SLOTS = Array.from({ length: 25 }, (_, i) => `category${i + 1}`) as string[];

type PlanDetails = {
  "@odata.etag"?: string;
  categoryDescriptions?: Record<string, string | null>;
};

/**
 * Maps the given labels to Planner category slots.
 * Creates new category slots in the plan for labels that don't have one yet.
 * Returns the appliedCategories object for the task (e.g. { category1: true, category3: true }).
 */
async function resolveAppliedCategories(
  accessToken: string,
  planId: string,
  labels: string[],
): Promise<Record<string, boolean>> {
  if (!labels.length) return {};

  const planDetailsUrl = `https://graph.microsoft.com/v1.0/planner/plans/${encodeURIComponent(planId)}/details`;
  const detailsRes = await fetch(planDetailsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!detailsRes.ok) return {};

  const planDetails = (await detailsRes.json()) as PlanDetails;
  const categories: Record<string, string | null> = planDetails.categoryDescriptions ?? {};
  const etag = planDetails["@odata.etag"];

  // Build a map of existing label→slot
  const labelToSlot: Record<string, string> = {};
  for (const slot of CATEGORY_SLOTS) {
    const name = categories[slot];
    if (name) labelToSlot[name.toLowerCase()] = slot;
  }

  const newCategories: Record<string, string> = {};
  const applied: Record<string, boolean> = {};

  for (const label of labels) {
    const key = label.toLowerCase();
    if (labelToSlot[key]) {
      applied[labelToSlot[key]!] = true;
    } else {
      // Find a free slot
      const freeSlot = CATEGORY_SLOTS.find((s) => !categories[s] && !newCategories[s]);
      if (freeSlot) {
        newCategories[freeSlot] = label;
        labelToSlot[key] = freeSlot;
        applied[freeSlot] = true;
      }
    }
  }

  // Patch the plan with any new category names
  if (Object.keys(newCategories).length > 0 && etag) {
    await fetch(planDetailsUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": etag,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ categoryDescriptions: newCategories }),
    });
  }

  return applied;
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
    const labels = parseLabels(request.labels, request.isFormal);
    const appliedCategories = await resolveAppliedCategories(accessToken, env.PLANNER_PLAN_ID!, labels);

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
        ...(Object.keys(appliedCategories).length ? { appliedCategories } : {}),
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
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 2000) : "Unknown Planner synchronization error";
    await db.request.update({
      where: { id: request.id },
      data: { plannerSyncError: detail },
    });
    console.error(`Planner sync failed for request ${request.id}:`, error);
  }
}

/**
 * Syncs the current assignees of a request to the Planner task.
 * Replaces all existing Planner assignments with the current set.
 * azureUserIds must be the Azure OIDs of the assignees.
 */
export async function syncRequestAssigneesToPlanner(requestId: string, azureUserIds: string[]): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true },
    });
    if (!req?.plannerTaskId) return;

    const accessToken = await getDelegatedGraphToken();

    // Fetch current task to get etag and existing assignments
    const taskUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}`;
    const taskRes = await fetch(taskUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!taskRes.ok) return;

    const task = (await taskRes.json()) as { "@odata.etag"?: string; assignments?: Record<string, unknown> };
    const etag = task["@odata.etag"];
    if (!etag) return;

    // Build assignments object: set new assignees to assigned, null out removed ones
    const currentAssignees = Object.keys(task.assignments ?? {});
    const assignments: Record<string, { "@odata.type": string; orderHint: string } | null> = {};

    // Remove all current assignments not in new list
    for (const uid of currentAssignees) {
      if (!azureUserIds.includes(uid)) assignments[uid] = null;
    }
    // Add new assignments
    for (const uid of azureUserIds) {
      if (!currentAssignees.includes(uid)) {
        assignments[uid] = { "@odata.type": "#microsoft.graph.plannerAssignment", orderHint: " !" };
      }
    }

    if (Object.keys(assignments).length === 0) return;

    await fetch(taskUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": etag,
      },
      body: JSON.stringify({ assignments }),
    });
  } catch (error) {
    console.error(`Planner assignee sync failed for request ${requestId}:`, error);
  }
}

/**
 * Syncs the estimated delivery date of a request to the Planner task due date.
 * Pass null to clear the due date.
 */
export async function syncRequestDueDateToPlanner(
  requestId: string,
  dueDate: Date | null,
): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true },
    });
    if (!req?.plannerTaskId) return;

    const accessToken = await getDelegatedGraphToken();
    const taskUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}`;
    const taskRes = await fetch(taskUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!taskRes.ok) return;

    const task = (await taskRes.json()) as { "@odata.etag"?: string };
    if (!task["@odata.etag"]) return;

    await fetch(taskUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": task["@odata.etag"],
      },
      body: JSON.stringify({ dueDateTime: dueDate ? dueDate.toISOString() : null }),
    });
  } catch (error) {
    console.error(`Planner due date sync failed for request ${requestId}:`, error);
  }
}

/**
 * Syncs the current labels of a request to Planner appliedCategories.
 * Clears old categories then applies the new set.
 */
export async function syncRequestCategoriesToPlanner(
  requestId: string,
  labels: string[],
  isFormal: boolean,
): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true },
    });
    if (!req?.plannerTaskId) return;

    const accessToken = await getDelegatedGraphToken();
    const fullLabels = parseLabels(JSON.stringify(labels), isFormal);
    const appliedCategories = await resolveAppliedCategories(accessToken, env.PLANNER_PLAN_ID!, fullLabels);

    const taskUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}`;
    const taskRes = await fetch(taskUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!taskRes.ok) return;

    const task = (await taskRes.json()) as { "@odata.etag"?: string; appliedCategories?: Record<string, boolean> };
    if (!task["@odata.etag"]) return;

    // Null out all currently applied categories, then apply new ones
    const patch: Record<string, boolean | null> = {};
    for (const slot of Object.keys(task.appliedCategories ?? {})) {
      patch[slot] = null;
    }
    Object.assign(patch, appliedCategories);

    await fetch(taskUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": task["@odata.etag"],
      },
      body: JSON.stringify({ appliedCategories: patch }),
    });
  } catch (error) {
    console.error(`Planner category sync failed for request ${requestId}:`, error);
  }
}

/**
 * Moves a Planner task into the bucket whose name matches the given status name.
 * Creates the bucket in the plan if it doesn't exist yet.
 */
export async function syncRequestBucketToPlanner(requestId: string, statusName: string): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true },
    });
    if (!req?.plannerTaskId) return;

    const accessToken = await getDelegatedGraphToken();
    const planId = env.PLANNER_PLAN_ID!;

    // List existing buckets in the plan
    const bucketsRes = await fetch(
      `https://graph.microsoft.com/v1.0/planner/plans/${encodeURIComponent(planId)}/buckets`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!bucketsRes.ok) return;

    const bucketsData = (await bucketsRes.json()) as { value: { id: string; name: string }[] };
    const existing = bucketsData.value.find((b) => b.name.toLowerCase() === statusName.toLowerCase());

    let bucketId: string;
    if (existing) {
      bucketId = existing.id;
    } else {
      // Create a new bucket with this status name
      const createRes = await fetch("https://graph.microsoft.com/v1.0/planner/buckets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planId, name: statusName, orderHint: " !" }),
      });
      if (!createRes.ok) return;
      const newBucket = (await createRes.json()) as { id: string };
      bucketId = newBucket.id;
    }

    // Fetch task etag then patch its bucketId
    const taskUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}`;
    const taskRes = await fetch(taskUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!taskRes.ok) return;

    const task = (await taskRes.json()) as { "@odata.etag"?: string };
    if (!task["@odata.etag"]) return;

    await fetch(taskUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": task["@odata.etag"],
      },
      body: JSON.stringify({ bucketId }),
    });
  } catch (error) {
    console.error(`Planner bucket sync failed for request ${requestId}:`, error);
  }
}

/**
 * Adds an uploaded document as a reference link on the Planner task.
 * Only syncs OneDrive-stored files (local files lack a stable public URL).
 */
export async function syncDocumentToPlanner(
  requestId: string,
  filename: string,
  storedUrl: string,
  preResolvedToken?: string,
): Promise<void> {
  if (!plannerEnabled()) return;
  if (!storedUrl.startsWith("onedrive:")) {
    console.log(`[Planner] Skipping document sync for ${filename} — not on OneDrive (url: ${storedUrl})`);
    return;
  }

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true },
    });
    if (!req?.plannerTaskId) {
      console.log(`[Planner] Skipping document sync for ${filename} — no plannerTaskId on request ${requestId}`);
      return;
    }

    const drivePath = storedUrl.replace(/^onedrive:/, "");
    const webUrl = await getOneDriveWebUrl(drivePath);
    if (!webUrl) {
      console.log(`[Planner] Skipping document sync for ${filename} — could not get OneDrive webUrl for ${drivePath}`);
      return;
    }

    const accessToken = preResolvedToken ?? await getDelegatedGraphToken();
    const detailsUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}/details`;

    const detailsRes = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!detailsRes.ok) {
      console.error(`[Planner] Failed to fetch task details: ${detailsRes.status} ${await detailsRes.text()}`);
      return;
    }

    const details = (await detailsRes.json()) as { "@odata.etag"?: string };
    if (!details["@odata.etag"]) return;

    // Planner reference key format per Graph API docs:
    // encode ":" as %3A, keep "/" as-is, encode "." as %2E
    // (encodeURIComponent is wrong — it encodes "/" as %2F which Planner rejects)
    let decodedUrl: string;
    try { decodedUrl = decodeURIComponent(webUrl); } catch { decodedUrl = webUrl; }
    const encodedUrl = decodedUrl.replace(/:/g, "%3A").replace(/\./g, "%2E");
    console.log(`[Planner] Adding reference for ${filename}, key: ${encodedUrl}`);

    const patchRes = await fetch(detailsUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": details["@odata.etag"],
      },
      body: JSON.stringify({
        references: {
          [encodedUrl]: {
            "@odata.type": "#microsoft.graph.plannerExternalReference",
            alias: filename,
            type: "Other",
          },
        },
      }),
    });
    if (!patchRes.ok) {
      console.error(`[Planner] Failed to add reference: ${patchRes.status} ${await patchRes.text()}`);
    } else {
      console.log(`[Planner] Added reference for ${filename} to task ${req.plannerTaskId}`);
    }
  } catch (error) {
    console.error(`Planner document sync failed for request ${requestId}:`, error);
  }
}

/**
 * Adds a request comment as a reply in the linked Planner task conversation thread.
 * This is best-effort and should never block comment creation in the app.
 */
export async function syncRequestCommentToPlanner(
  requestId: string,
  authorName: string,
  commentText: string,
): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true },
    });
    if (!req?.plannerTaskId) return;

    const accessToken = await getDelegatedGraphToken();
    const taskUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}?$select=conversationThreadId,planId`;
    const taskRes = await fetch(taskUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!taskRes.ok) return;

    const task = (await taskRes.json()) as { conversationThreadId?: string; planId?: string };
    if (!task.conversationThreadId || !task.planId) return;

    const planUrl = `https://graph.microsoft.com/v1.0/planner/plans/${encodeURIComponent(task.planId)}?$select=container`;
    const planRes = await fetch(planUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!planRes.ok) return;

    const plan = (await planRes.json()) as {
      container?: { containerId?: string; type?: string };
    };
    const groupId = plan.container?.containerId;
    if (!groupId) return;

    const replyUrl = `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(task.conversationThreadId)}/reply`;
    const content = `[QA Audit Tool] ${authorName} commented:\n${commentText}`;

    const replyRes = await fetch(replyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post: {
          body: {
            contentType: "text",
            content,
          },
        },
      }),
    });

    if (!replyRes.ok) {
      console.error(
        `[Planner] Failed to post comment for request ${requestId}: ${replyRes.status} ${await replyRes.text()}`,
      );
    }
  } catch (error) {
    console.error(`Planner comment sync failed for request ${requestId}:`, error);
  }
}

/**
 * Adds a request note update as a reply in the linked Planner task conversation thread.
 * This is best-effort and should never block note saving in the app.
 */
export async function syncRequestNoteToPlanner(
  requestId: string,
  authorName: string,
  noteText: string,
): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true },
    });
    if (!req?.plannerTaskId) return;

    const accessToken = await getDelegatedGraphToken();
    const taskUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}?$select=conversationThreadId,planId`;
    const taskRes = await fetch(taskUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!taskRes.ok) return;

    const task = (await taskRes.json()) as { conversationThreadId?: string; planId?: string };
    if (!task.conversationThreadId || !task.planId) return;

    const planUrl = `https://graph.microsoft.com/v1.0/planner/plans/${encodeURIComponent(task.planId)}?$select=container`;
    const planRes = await fetch(planUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!planRes.ok) return;

    const plan = (await planRes.json()) as {
      container?: { containerId?: string; type?: string };
    };
    const groupId = plan.container?.containerId;
    if (!groupId) return;

    const replyUrl = `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(task.conversationThreadId)}/reply`;
    const trimmed = noteText.trim();
    const content = trimmed
      ? `[QA Audit Tool] ${authorName} updated the request note:\n${trimmed}`
      : `[QA Audit Tool] ${authorName} cleared the request note.`;

    const replyRes = await fetch(replyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post: {
          body: {
            contentType: "text",
            content,
          },
        },
      }),
    });

    if (!replyRes.ok) {
      console.error(
        `[Planner] Failed to post note for request ${requestId}: ${replyRes.status} ${await replyRes.text()}`,
      );
    }
  } catch (error) {
    console.error(`Planner note sync failed for request ${requestId}:`, error);
  }
}
