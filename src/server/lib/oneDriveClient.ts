/**
 * OneDrive file storage client using Microsoft Graph API.
 * Uses the Azure AD app registration (client_credentials flow) to store files
 * in the CTAMI-Automations@philips.com OneDrive.
 *
 * Falls back to local disk storage if OneDrive credentials are not configured
 * or if the upload fails.
 */

import { env } from "@/env";
import { writeFile, mkdir, unlink, readFile, rm } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// ─── Token cache ───────────────────────────────────────────────────────────────

let cachedOneDriveToken: { value: string; expiresAt: number } | null = null;

async function getOneDriveToken(): Promise<string> {
  const now = Date.now();
  if (cachedOneDriveToken && cachedOneDriveToken.expiresAt > now + 60_000) {
    return cachedOneDriveToken.value;
  }

  const tenantId = env.AZURE_AD_TENANT_ID;
  const clientId = env.AZURE_AD_CLIENT_ID;
  const clientSecret = env.AZURE_AD_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("OneDrive credentials not configured");
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneDrive token error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedOneDriveToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return cachedOneDriveToken.value;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ONEDRIVE_USER = env.OUTLOOK_ORGANIZER_EMAIL ?? "CTAMI-Automations@philips.com";
const ROOT_FOLDER = "AuditTool";

function isOneDriveConfigured(): boolean {
  return !!(env.AZURE_AD_CLIENT_ID && env.AZURE_AD_CLIENT_SECRET && env.AZURE_AD_TENANT_ID);
}

/**
 * Build the full OneDrive path: /AuditTool/{relativePath}
 */
function buildDrivePath(relativePath: string): string {
  // Ensure no double slashes
  const clean = relativePath.replace(/^\/+/, "");
  return `/${ROOT_FOLDER}/${clean}`;
}

// ─── Upload ────────────────────────────────────────────────────────────────────

export interface UploadResult {
  /** "onedrive" or "local" */
  storage: "onedrive" | "local";
  /** The URL to use for download (stored in DB) */
  url: string;
  /** OneDrive path (if stored in cloud) */
  drivePath?: string;
}

/**
 * Upload a file to OneDrive. Falls back to local disk on failure.
 *
 * @param buffer - File content
 * @param relativePath - Path relative to root, e.g. "auditSlug/requests/reqSlug/filename.pdf"
 * @param localDir - Local directory for fallback storage
 * @param localFilename - Filename for local fallback
 * @param apiUrlPath - The API URL path prefix for local serving, e.g. "/api/uploads/auditSlug/requests/reqSlug/filename.pdf"
 */
export async function uploadFile(
  buffer: Buffer,
  relativePath: string,
  localDir: string,
  localFilename: string,
  apiUrlPath: string,
): Promise<UploadResult> {
  // Try OneDrive first
  if (isOneDriveConfigured()) {
    try {
      const drivePath = buildDrivePath(relativePath);
      const token = await getOneDriveToken();

      // For files <= 4MB, use simple upload. For larger files, use upload session.
      if (buffer.length <= 4 * 1024 * 1024) {
        await simpleUpload(token, drivePath, buffer);
      } else {
        await resumableUpload(token, drivePath, buffer);
      }

      return {
        storage: "onedrive",
        url: `onedrive:${drivePath}`,
        drivePath,
      };
    } catch (error) {
      console.error("[OneDrive] Upload failed, falling back to local:", error);
    }
  }

  // Fallback: save locally
  if (!existsSync(localDir)) {
    await mkdir(localDir, { recursive: true });
  }
  await writeFile(join(localDir, localFilename), buffer);

  return {
    storage: "local",
    url: apiUrlPath,
  };
}

/**
 * Simple upload (files <= 4MB)
 */
async function simpleUpload(token: string, drivePath: string, buffer: Buffer): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(drivePath).replace(/%2F/g, "/")}:/content`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneDrive simple upload failed: ${res.status} ${text}`);
  }
}

/**
 * Resumable upload session (files > 4MB, up to 250MB)
 */
async function resumableUpload(token: string, drivePath: string, buffer: Buffer): Promise<void> {
  // 1. Create upload session
  const sessionUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(drivePath).replace(/%2F/g, "/")}:/createUploadSession`;

  const sessionRes = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      item: { "@microsoft.graph.conflictBehavior": "replace" },
    }),
  });

  if (!sessionRes.ok) {
    const text = await sessionRes.text();
    throw new Error(`OneDrive create session failed: ${sessionRes.status} ${text}`);
  }

  const session = (await sessionRes.json()) as { uploadUrl: string };

  // 2. Upload in chunks (10MB each)
  const CHUNK_SIZE = 10 * 1024 * 1024;
  const totalSize = buffer.length;

  for (let offset = 0; offset < totalSize; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = buffer.subarray(offset, end);

    const chunkRes = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: new Uint8Array(chunk),
    });

    if (!chunkRes.ok && chunkRes.status !== 202) {
      const text = await chunkRes.text();
      throw new Error(`OneDrive chunk upload failed at offset ${offset}: ${chunkRes.status} ${text}`);
    }
  }
}

// ─── Download ──────────────────────────────────────────────────────────────────

/**
 * Get a temporary download URL for a file stored in OneDrive.
 * Returns null if the file doesn't exist or on error.
 */
export async function getOneDriveDownloadUrl(drivePath: string): Promise<string | null> {
  if (!isOneDriveConfigured()) return null;

  try {
    const token = await getOneDriveToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(drivePath).replace(/%2F/g, "/")}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { "@microsoft.graph.downloadUrl"?: string };
    return data["@microsoft.graph.downloadUrl"] ?? null;
  } catch (error) {
    console.error("[OneDrive] Failed to get download URL:", error);
    return null;
  }
}

/**
 * Get the Office Online web URL for a file stored in OneDrive.
 * This URL opens the file in Office Online (Word/Excel/PowerPoint in the browser)
 * and supports real-time co-authoring.
 * Returns null if the file doesn't exist, is not an Office file, or on error.
 */
export async function getOneDriveWebUrl(drivePath: string): Promise<string | null> {
  if (!isOneDriveConfigured()) return null;

  try {
    const token = await getOneDriveToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(drivePath).replace(/%2F/g, "/")}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { webUrl?: string };
    return data.webUrl ?? null;
  } catch (error) {
    console.error("[OneDrive] Failed to get web URL:", error);
    return null;
  }
}

/**
 * Get file content from OneDrive as a Buffer.
 * Uses the /content endpoint directly with the app token so the server
 * never redirects the browser to a SharePoint URL that may be blocked
 * by Conditional Access Policies.
 */
export async function getOneDriveFileBuffer(drivePath: string): Promise<{ buffer: Buffer; size: number } | null> {
  if (!isOneDriveConfigured()) return null;

  try {
    const token = await getOneDriveToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(drivePath).replace(/%2F/g, "/")}:/content`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), size: arrayBuffer.byteLength };
  } catch (error) {
    console.error("[OneDrive] Failed to get file buffer:", error);
    return null;
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────────

/**
 * Delete a file from OneDrive. Returns true if successful.
 */
export async function deleteOneDriveFile(drivePath: string): Promise<boolean> {
  if (!isOneDriveConfigured()) return false;

  try {
    const token = await getOneDriveToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(drivePath).replace(/%2F/g, "/")}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    return res.ok || res.status === 404; // 404 = already gone, treat as success
  } catch (error) {
    console.error("[OneDrive] Delete failed:", error);
    return false;
  }
}

// ─── Local file helpers (used by download endpoint) ────────────────────────────

/**
 * Read a local file from the uploads directory.
 */
export async function readLocalFile(filepath: string): Promise<Buffer | null> {
  try {
    if (!existsSync(filepath)) return null;
    return await readFile(filepath);
  } catch {
    return null;
  }
}

/**
 * Delete a local file.
 */
export async function deleteLocalFile(filepath: string): Promise<boolean> {
  try {
    if (existsSync(filepath)) {
      await unlink(filepath);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively delete a local folder and all its contents. Safe no-op when
 * the directory does not exist.
 */
export async function deleteLocalFolder(folderPath: string): Promise<boolean> {
  try {
    if (existsSync(folderPath)) {
      await rm(folderPath, { recursive: true, force: true });
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Folder helpers ────────────────────────────────────────────────────────────

export interface CreateFolderResult {
  storage: "onedrive" | "local";
  /** URL marker stored in DB for folder rows: always "folder:<drivePath>" */
  url: string;
}

/**
 * Create a folder on OneDrive (and locally as fallback). When OneDrive is
 * configured the folder is created on the drive; otherwise we only create the
 * local directory. The returned URL is always `folder:<drivePath>` so the
 * application can recognise folder rows regardless of storage backend.
 */
export async function createFolder(
  relativePath: string,
  localDir: string,
): Promise<CreateFolderResult> {
  const drivePath = buildDrivePath(relativePath);

  // Always create the local mirror so previews / local fallback work
  if (!existsSync(localDir)) {
    try {
      await mkdir(localDir, { recursive: true });
    } catch (error) {
      console.error("[Folder] Failed to create local folder:", error);
    }
  }

  if (isOneDriveConfigured()) {
    try {
      await createOneDriveFolderPath(drivePath);
      return { storage: "onedrive", url: `folder:${drivePath}` };
    } catch (error) {
      console.error("[OneDrive] Folder create failed, using local only:", error);
    }
  }

  return { storage: "local", url: `folder:${drivePath}` };
}

/**
 * Recursively create a folder path on OneDrive. Each segment is created with
 * conflictBehavior=replace so existing folders are reused.
 */
async function createOneDriveFolderPath(drivePath: string): Promise<void> {
  const token = await getOneDriveToken();
  const clean = drivePath.replace(/^\/+/, "").replace(/\/+$/, "");
  const segments = clean.split("/").filter(Boolean);
  if (segments.length === 0) return;

  // Walk segments, creating each missing folder under its parent
  for (let i = 0; i < segments.length; i++) {
    const parentSegments = segments.slice(0, i);
    const name = segments[i]!;
    const parentPath = `/${parentSegments.join("/")}`;

    const url =
      parentSegments.length === 0
        ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root/children`
        : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(parentPath).replace(/%2F/g, "/")}:/children`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace",
      }),
    });

    // 200/201 created, 409 conflict (already exists) → both fine
    if (!res.ok && res.status !== 409) {
      const text = await res.text();
      throw new Error(`OneDrive folder create failed for "${name}": ${res.status} ${text}`);
    }
  }
}

// ─── URL utilities ─────────────────────────────────────────────────────────────

/**
 * Check if a document URL points to OneDrive storage.
 */
export function isOneDriveUrl(url: string): boolean {
  return url.startsWith("onedrive:");
}

/**
 * Extract the drive path from an onedrive: URL.
 */
export function extractDrivePath(url: string): string {
  return url.replace(/^onedrive:/, "");
}

// ─── Sharing ───────────────────────────────────────────────────────────────────

export interface ShareResult {
  succeeded: string[];
  failed: string[];
  notConfigured?: boolean;
  error?: string;
  warning?: string;
  requestedPermission?: SharePermissionLevel;
  appliedPermission?: "view" | "edit";
}

export type SharePermissionLevel = "view" | "edit";

type GraphUserIdentity = {
  email?: string;
  userPrincipalName?: string;
};

type GraphPermission = {
  id?: string;
  invitation?: { email?: string };
  grantedToV2?: { user?: GraphUserIdentity };
  grantedToIdentitiesV2?: Array<{ user?: GraphUserIdentity }>;
};

function normaliseEmail(v: string): string {
  return v.trim().toLowerCase();
}

function permissionTargetsEmail(permission: GraphPermission, targetEmail: string): boolean {
  const target = normaliseEmail(targetEmail);
  const candidates: string[] = [];

  if (permission.invitation?.email) candidates.push(permission.invitation.email);
  if (permission.grantedToV2?.user?.email) candidates.push(permission.grantedToV2.user.email);
  if (permission.grantedToV2?.user?.userPrincipalName) {
    candidates.push(permission.grantedToV2.user.userPrincipalName);
  }
  for (const identity of permission.grantedToIdentitiesV2 ?? []) {
    if (identity.user?.email) candidates.push(identity.user.email);
    if (identity.user?.userPrincipalName) candidates.push(identity.user.userPrincipalName);
  }

  return candidates.some((c) => normaliseEmail(c) === target);
}

async function resolveDriveItemId(token: string, drivePath: string): Promise<string | null> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(drivePath).replace(/%2F/g, "/")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[OneDrive] Failed to resolve drive item for share path ${drivePath}: ${res.status} ${text}`);
    return null;
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

async function removeDirectPermissionsForEmails(token: string, drivePath: string, emails: string[]): Promise<void> {
  const itemId = await resolveDriveItemId(token, drivePath);
  if (!itemId) return;

  const listUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/items/${encodeURIComponent(itemId)}/permissions`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "");
    console.error(`[OneDrive] Failed to list permissions for ${drivePath}: ${listRes.status} ${text}`);
    return;
  }

  const payload = (await listRes.json()) as { value?: GraphPermission[] };
  const permissions = payload.value ?? [];

  for (const permission of permissions) {
    if (!permission.id) continue;
    const isTarget = emails.some((email) => permissionTargetsEmail(permission, email));
    if (!isTarget) continue;

    const deleteUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/items/${encodeURIComponent(itemId)}/permissions/${encodeURIComponent(permission.id)}`;
    const deleteRes = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Some entries can be inherited/non-removable; log and continue.
    if (!deleteRes.ok && deleteRes.status !== 404) {
      const text = await deleteRes.text().catch(() => "");
      console.error(`[OneDrive] Failed to delete permission ${permission.id}: ${deleteRes.status} ${text}`);
    }
  }
}

/**
 * Share an OneDrive folder with a list of email addresses by sending them an
 * invite via Microsoft Graph. Each recipient gets view access (read-only) and
 * receives an email notification.
 *
 * @param drivePath - Absolute drive path, e.g. "/AuditTool/Audits/My Audit/Auditors"
 * @param emails    - List of email addresses to invite
 * @param message   - Optional message included in the invite email
 */
export async function shareOneDriveFolder(
  drivePath: string,
  emails: string[],
  message?: string,
  permissionLevel: SharePermissionLevel = "view",
): Promise<ShareResult> {
  if (!isOneDriveConfigured()) {
    return {
      succeeded: [],
      failed: emails,
      notConfigured: true,
      error: "OneDrive credentials are not configured",
      requestedPermission: permissionLevel,
      appliedPermission: permissionLevel === "edit" ? "edit" : "view",
    };
  }

  let token: string;
  try {
    token = await getOneDriveToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to acquire OneDrive token";
    console.error("[OneDrive] Failed to acquire token for sharing:", err);
    return {
      succeeded: [],
      failed: emails,
      error: msg,
      requestedPermission: permissionLevel,
      appliedPermission: permissionLevel === "edit" ? "edit" : "view",
    };
  }
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive/root:${encodeURIComponent(drivePath).replace(/%2F/g, "/")}:/invite`;
  const graphRoles = permissionLevel === "edit" ? ["write"] : ["read"];

  // Replace-permission semantics: remove direct permissions for these emails
  // before adding the requested role, so edit -> view actually downgrades.
  try {
    await removeDirectPermissionsForEmails(token, drivePath, emails);
  } catch (err) {
    console.error("[OneDrive] Failed during pre-share permission cleanup:", err);
  }

  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const email of emails) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requireSignIn: true,
          sendInvitation: true,
          roles: graphRoles,
          recipients: [{ email }],
          message: message ?? "You have been granted access to the Auditors folder.",
        }),
      });

      if (res.ok) {
        succeeded.push(email);
      } else {
        const text = await res.text();
        console.error(`[OneDrive] Share invite failed for ${email}: ${res.status} ${text}`);
        failed.push(email);
      }
    } catch (err) {
      console.error(`[OneDrive] Share invite error for ${email}:`, err);
      failed.push(email);
    }
  }

  return {
    succeeded,
    failed,
    requestedPermission: permissionLevel,
    appliedPermission: permissionLevel === "edit" ? "edit" : "view",
  };
}
