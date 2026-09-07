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

function taskEtaLine(estimatedDeliveryDate: Date | null): string {
  if (!estimatedDeliveryDate) return "ETA: Not set";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(estimatedDeliveryDate).toLowerCase();

  return `ETA: ${formatted}`;
}

const NOTES_HEADER = "Notes:";
const COMMENTS_HEADER = "Comments:";
const ASSIGNEE_PREFIX = "This task is assigned to:";
const ASSIGNEE_UNASSIGNED = "This task is currently unassigned.";
const ETA_PREFIX = "ETA:";

function isManagedBoundaryLine(line: string): boolean {
  return (
    line === NOTES_HEADER ||
    line === COMMENTS_HEADER ||
    line.startsWith(ETA_PREFIX) ||
    line.startsWith(ASSIGNEE_PREFIX) ||
    line === ASSIGNEE_UNASSIGNED
  );
}

function getManagedSectionLines(description: string, header: string): string[] {
  const lines = description.split(/\r?\n/);
  const idx = lines.indexOf(header);
  if (idx < 0) return [];

  const section: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (isManagedBoundaryLine(line)) break;
    section.push(line);
  }
  return section;
}

function getManagedSingleLine(description: string, predicate: (line: string) => boolean): string | null {
  for (const line of description.split(/\r?\n/)) {
    if (predicate(line)) return line;
  }
  return null;
}

function buildManagedDescription(params: {
  etaLine: string | null;
  assigneeLine: string | null;
  notesLines: string[];
  commentLines: string[];
}): string {
  const out: string[] = [];

  if (params.etaLine) out.push(params.etaLine);
  if (params.assigneeLine) out.push(params.assigneeLine);

  const notes = params.notesLines.length > 0 ? params.notesLines : ["Not set"];
  if (out.length > 0) out.push("");
  out.push(NOTES_HEADER, ...notes);

  const comments = params.commentLines.filter((line) => line.trim().length > 0);
  if (comments.length > 0) {
    out.push("", COMMENTS_HEADER, ...comments);
  }

  return out.join("\n");
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
        ...(Object.keys(appliedCategories).length ? { appliedCategories } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph returned ${response.status}: ${await response.text()}`);
    }
    const plannerTask = (await response.json()) as { id: string };
    await addTaskDescription(
      accessToken,
      plannerTask.id,
      taskEtaLine(request.estimatedDeliveryDate),
    );
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
 * Syncs assignee information to Planner task notes only.
 * This does NOT modify Planner task assignments.
 */
export async function syncRequestAssigneesToPlanner(requestId: string, _azureUserIds: string[]): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true },
    });
    if (!req?.plannerTaskId) return;

    const accessToken = await getDelegatedGraphToken();

    const assigneeRows = await db.requestAssignee.findMany({
      where: { requestId },
      select: { assigneeName: true },
    });
    const assigneeNames = Array.from(
      new Set(
        assigneeRows
          .map((row) => row.assigneeName?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    );

    const assigneeLine = assigneeNames.length > 0
      ? `This task is assigned to: ${assigneeNames.join(", ")}`
      : "This task is currently unassigned.";

    const detailsUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}/details`;
    const detailsRes = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!detailsRes.ok) return;

    const details = (await detailsRes.json()) as { "@odata.etag"?: string; description?: string | null };
    const detailsEtag = details["@odata.etag"];
    if (!detailsEtag) return;

    const currentDescription = details.description ?? "";
    const etaLine = getManagedSingleLine(currentDescription, (line) => line.startsWith(ETA_PREFIX));
    const notesLines = getManagedSectionLines(currentDescription, NOTES_HEADER).filter((line) => line.trim().length > 0);
    const commentLines = getManagedSectionLines(currentDescription, COMMENTS_HEADER).filter((line) => line.trim().length > 0);
    const nextDescription = buildManagedDescription({ etaLine, assigneeLine, notesLines, commentLines });

    await fetch(detailsUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": detailsEtag,
      },
      body: JSON.stringify({ description: nextDescription }),
    });
  } catch (error) {
    console.error(`Planner assignee sync failed for request ${requestId}:`, error);
  }
}

/**
 * Writes the current request ETA into the Planner task notes (description).
 * This keeps ETA visible in notes without using Planner dueDate.
 */
export async function syncRequestEtaToPlannerNotes(requestId: string): Promise<void> {
  if (!plannerEnabled()) return;

  try {
    const req = await db.request.findUnique({
      where: { id: requestId },
      select: { plannerTaskId: true, estimatedDeliveryDate: true },
    });
    if (!req?.plannerTaskId) return;

    const accessToken = await getDelegatedGraphToken();
    const detailsUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}/details`;
    const detailsRes = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!detailsRes.ok) return;

    const details = (await detailsRes.json()) as { "@odata.etag"?: string; description?: string | null };
    const detailsEtag = details["@odata.etag"];
    if (!detailsEtag) return;

    const currentDescription = details.description ?? "";
    const assigneeLine = getManagedSingleLine(
      currentDescription,
      (line) => line.startsWith(ASSIGNEE_PREFIX) || line === ASSIGNEE_UNASSIGNED,
    );
    const notesLines = getManagedSectionLines(currentDescription, NOTES_HEADER).filter((line) => line.trim().length > 0);
    const commentLines = getManagedSectionLines(currentDescription, COMMENTS_HEADER).filter((line) => line.trim().length > 0);
    const nextDescription = buildManagedDescription({
      etaLine: taskEtaLine(req.estimatedDeliveryDate),
      assigneeLine,
      notesLines,
      commentLines,
    });

    await fetch(detailsUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": detailsEtag,
      },
      body: JSON.stringify({ description: nextDescription }),
    });
  } catch (error) {
    console.error(`Planner ETA notes sync failed for request ${requestId}:`, error);
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
 * Syncs request comments into Planner task description under a managed
 * "Comments:" section, with one comment per line.
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
    const detailsUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}/details`;
    const detailsRes = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!detailsRes.ok) return;

    const details = (await detailsRes.json()) as { "@odata.etag"?: string; description?: string | null };
    const detailsEtag = details["@odata.etag"];
    if (!detailsEtag) return;

    const currentDescription = details.description ?? "";
    const etaLine = getManagedSingleLine(currentDescription, (line) => line.startsWith(ETA_PREFIX));
    const assigneeLine = getManagedSingleLine(
      currentDescription,
      (line) => line.startsWith(ASSIGNEE_PREFIX) || line === ASSIGNEE_UNASSIGNED,
    );
    const notesLines = getManagedSectionLines(currentDescription, NOTES_HEADER).filter((line) => line.trim().length > 0);
    const existingComments = getManagedSectionLines(currentDescription, COMMENTS_HEADER)
      .map((line) => line.trim())
      .filter(Boolean);

    const trimmed = commentText.trim();
    const nextEntry = `${authorName}: ${trimmed || "(empty comment)"}`;
    const nextComments = [...existingComments, nextEntry];
    const nextDescription = buildManagedDescription({
      etaLine,
      assigneeLine,
      notesLines,
      commentLines: nextComments,
    });

    await fetch(detailsUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": detailsEtag,
      },
      body: JSON.stringify({ description: nextDescription }),
    });
  } catch (error) {
    console.error(`Planner comment sync failed for request ${requestId}:`, error);
  }
}

/**
 * Syncs request note text into Planner task description under a managed
 * "Notes:" section, with content on the next line.
 * This is best-effort and should never block note saving in the app.
 */
export async function syncRequestNoteToPlanner(
  requestId: string,
  _authorName: string,
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
    const detailsUrl = `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(req.plannerTaskId)}/details`;
    const detailsRes = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!detailsRes.ok) return;

    const details = (await detailsRes.json()) as { "@odata.etag"?: string; description?: string | null };
    const detailsEtag = details["@odata.etag"];
    if (!detailsEtag) return;

    const trimmed = noteText.trim();
    const currentDescription = details.description ?? "";
    const etaLine = getManagedSingleLine(currentDescription, (line) => line.startsWith(ETA_PREFIX));
    const assigneeLine = getManagedSingleLine(
      currentDescription,
      (line) => line.startsWith(ASSIGNEE_PREFIX) || line === ASSIGNEE_UNASSIGNED,
    );
    const commentLines = getManagedSectionLines(currentDescription, COMMENTS_HEADER).filter((line) => line.trim().length > 0);
    const nextDescription = buildManagedDescription({
      etaLine,
      assigneeLine,
      notesLines: (trimmed || "Not set").split(/\r?\n/),
      commentLines,
    });

    await fetch(detailsUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": detailsEtag,
      },
      body: JSON.stringify({ description: nextDescription }),
    });
  } catch (error) {
    console.error(`Planner note sync failed for request ${requestId}:`, error);
  }
}
