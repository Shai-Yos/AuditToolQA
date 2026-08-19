import { env } from "@/env";

let cachedToken: { value: string; expiresAt: number } | null = null;
let cachedSearchToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.AZURE_AD_CLIENT_ID,
        client_secret: env.AZURE_AD_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get app token: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return cachedToken.value;
}

async function getSearchAppToken(): Promise<string> {
  const now = Date.now();
  if (cachedSearchToken && cachedSearchToken.expiresAt > now + 60_000) {
    return cachedSearchToken.value;
  }

  const clientId = env.AZURE_AD_SEARCH_CLIENT_ID ?? env.AZURE_AD_CLIENT_ID;
  const clientSecret = env.AZURE_AD_SEARCH_CLIENT_SECRET ?? env.AZURE_AD_CLIENT_SECRET;
  const tenantId = env.AZURE_AD_SEARCH_TENANT_ID ?? env.AZURE_AD_TENANT_ID;

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
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get search app token: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedSearchToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return cachedSearchToken.value;
}

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  department: string | null;
}

async function searchUsersByDisplayName(token: string, phrase: string): Promise<GraphUser[]> {
  const searchParam = encodeURIComponent(`"displayName:${phrase.replace(/"/g, "")}"`);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search=${searchParam}&$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Graph API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { value: GraphUser[] };
  return data.value;
}

async function searchUsersByMail(token: string, phrase: string): Promise<GraphUser[]> {
  const searchParam = encodeURIComponent(`"mail:${phrase.replace(/"/g, "")}"`);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search=${searchParam}&$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Graph API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { value: GraphUser[] };
  return data.value;
}

export async function searchUsers(query: string): Promise<GraphUser[]> {
  const token = await getSearchAppToken();
  const sanitized = query.replace(/"/g, "").trim();

  // Build search phrases: always search as-typed; if multi-word also search reversed
  // so "Smith John" finds "John Smith" and vice-versa
  const phrases = [sanitized];
  const parts = sanitized.split(/\s+/);
  if (parts.length >= 2) {
    phrases.push(parts.slice().reverse().join(" "));
  }

  const resultSets = await Promise.all([
    ...phrases.map((phrase) => searchUsersByDisplayName(token, phrase)),
    searchUsersByMail(token, sanitized),
  ]);

  // Merge and deduplicate by id, preserving order
  const seen = new Set<string>();
  const merged: GraphUser[] = [];
  for (const users of resultSets) {
    for (const u of users) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        merged.push(u);
      }
    }
  }
  return merged;
}

export async function getUserById(userId: string): Promise<GraphUser | null> {
  const token = await getAppToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}?$select=id,displayName,mail,userPrincipalName,jobTitle,department`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Graph API error: ${res.status} ${await res.text()}`);

  return (await res.json()) as GraphUser;
}

/**
 * Looks up a user's Azure OID by their email / UPN.
 * Returns null if not found.
 */
export async function getAzureOidByEmail(email: string): Promise<string | null> {
  const token = await getAppToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string };
  return data.id ?? null;
}

export async function sendMailViaGraph(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const sender = env.OUTLOOK_ORGANIZER_EMAIL;
  if (!sender) return false;

  try {
    const token = await getAppToken();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: params.subject,
            body: {
              contentType: "HTML",
              content: params.html,
            },
            toRecipients: [
              {
                emailAddress: { address: params.to },
              },
            ],
          },
          saveToSentItems: "false",
        }),
      },
    );

    if (!res.ok) {
      console.error(`[Mail] Graph sendMail failed for ${params.to}: ${res.status} ${await res.text()}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Mail] Graph sendMail error for ${params.to}:`, error);
    return false;
  }
}

// Azure AD group IDs that determine role — must match auth.config.ts
const ADMIN_GROUPS = [
  "8c601df7-9839-4423-8ccc-03339bb5c6cb",
  "80e58a83-b7ae-4ca1-a583-d462add96e9b",
];
const USER_GROUPS = ["e4ae5d7c-bf12-4d28-97d4-32a7d5d3a169"];

/**
 * Resolves the app role for a user via POST /checkMemberGroups.
 * This checks *transitive* group membership (nested groups included).
 * Checks admin groups first, then user/scribe groups.
 * Requires GroupMember.Read.All or Directory.Read.All application permission.
 * Falls back to "USER" on any error.
 */
export async function getUserAzureRole(userId: string): Promise<"ADMIN" | "USER"> {
  try {
    const token = await getAppToken();
    const allGroupIds = [...ADMIN_GROUPS, ...USER_GROUPS];

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/checkMemberGroups`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupIds: allGroupIds }),
      }
    );

    if (!res.ok) return "USER";

    const data = (await res.json()) as { value: string[] };
    const memberOf = new Set(data.value);

    // Admin check takes priority over user/scribe
    if (ADMIN_GROUPS.some((g) => memberOf.has(g))) return "ADMIN";
    if (USER_GROUPS.some((g) => memberOf.has(g))) return "USER";
    return "USER";
  } catch {
    return "USER";
  }
}

/**
 * Checks whether a user is a (transitive) member of a specific Azure AD group.
 * Requires GroupMember.Read.All or Directory.Read.All application permission.
 * Fails closed (returns false) on any error, so a Graph outage never grants access.
 */
export async function isMemberOfGroup(userId: string, groupId: string): Promise<boolean> {
  try {
    const token = await getAppToken();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/checkMemberGroups`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupIds: [groupId] }),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { value: string[] };
    return data.value.includes(groupId);
  } catch {
    return false;
  }
}

/**
 * Fetch all direct members of an Azure AD group (OIDs only, paginated).
 */
export async function listGroupMembers(groupId: string): Promise<string[]> {
  const token = await getAppToken();
  const oids: string[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(groupId)}/members?$select=id&$top=999`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = (await res.json()) as { value: Array<{ id: string }>; "@odata.nextLink"?: string };
    data.value.forEach((m) => oids.push(m.id));
    url = data["@odata.nextLink"] ?? null;
  }
  return oids;
}

/**
 * List every user in the tenant (paginated), returning id + displayName + mail/UPN.
 */
export async function listAllAzureUsers(): Promise<GraphUser[]> {
  const token = await getAppToken();
  const users: GraphUser[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = (await res.json()) as { value: GraphUser[]; "@odata.nextLink"?: string };
    users.push(...data.value);
    url = data["@odata.nextLink"] ?? null;
  }
  return users;
}

// ─── Group Management ────────────────────────────────────────────────────────

/**
 * All role groups keyed by role name.
 * Must stay in sync with auth.config.ts and auth.ts.
 */
const ROLE_GROUPS: Record<"ADMIN" | "AUDIT_OWNER" | "USER", string[]> = {
  ADMIN:       ["8c601df7-9839-4423-8ccc-03339bb5c6cb"],
  AUDIT_OWNER: ["8a7394c6-0e1d-444f-89a0-5e810ac4be89"],
  USER:        ["e4ae5d7c-bf12-4d28-97d4-32a7d5d3a169", "5b6192c2-5843-42c3-8310-58d9d700bbf8"],
};

/** Target group to ADD the user into when assigning a role */
const TARGET_GROUP: Record<"ADMIN" | "AUDIT_OWNER" | "USER", string> = {
  ADMIN:       "8c601df7-9839-4423-8ccc-03339bb5c6cb",
  AUDIT_OWNER: "8a7394c6-0e1d-444f-89a0-5e810ac4be89",
  USER:        "e4ae5d7c-bf12-4d28-97d4-32a7d5d3a169",
};

let cachedGroupToken: { value: string; expiresAt: number } | null = null;

/**
 * Acquires a token using the Azure AD app registration, which has the
 * permissions required to add/remove members from role groups.
 */
async function getGroupMgmtToken(): Promise<string> {
  const now = Date.now();
  if (cachedGroupToken && cachedGroupToken.expiresAt > now + 60_000) {
    return cachedGroupToken.value;
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.AZURE_AD_CLIENT_ID,
        client_secret: env.AZURE_AD_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Group management token error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedGroupToken = { value: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedGroupToken.value;
}

async function addUserToGroup(token: string, userOid: string, groupId: string): Promise<void> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userOid}`,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    // 400 "One or more added object references already exist" = user already a member, that's fine
    if (res.status === 400 && body.includes("already exist")) return;
    throw new Error(`Failed to add user to group ${groupId}: ${res.status} ${body}`);
  }
}

async function removeUserFromGroup(token: string, userOid: string, groupId: string): Promise<void> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/groups/${groupId}/members/${userOid}/$ref`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  // 404 = user is not a member — fine
  // 403 = we don't own this group — user can't be in it if we can't manage it, skip
  if (!res.ok && res.status !== 404 && res.status !== 403) {
    const body = await res.text();
    throw new Error(`Failed to remove user from group ${groupId}: ${res.status} ${body}`);
  }
}

/**
 * Moves a user between Azure AD role groups to reflect the new role.
 * Removes user from their current role's groups, then adds to the new role's target group.
 */
export async function setUserAzureGroupRole(
  userOid: string,
  currentRole: "ADMIN" | "AUDIT_OWNER" | "USER",
  newRole: "ADMIN" | "AUDIT_OWNER" | "USER"
): Promise<void> {
  if (currentRole === newRole) return;
  const token = await getGroupMgmtToken();
  // Remove from every group belonging to the current role
  await Promise.all(ROLE_GROUPS[currentRole].map((gid) => removeUserFromGroup(token, userOid, gid)));
  // Add to the target group for the new role
  await addUserToGroup(token, userOid, TARGET_GROUP[newRole]);
}

// ─── Photo ───────────────────────────────────────────────────────────────────

/** Thrown for transient failures (throttling, server errors) so callers can
 *  distinguish "confirmed no photo" (404) from "couldn't check right now". */
export class GraphPhotoUnavailableError extends Error {
  constructor(public status: number) {
    super(`Graph photo lookup failed: ${status}`);
  }
}

export async function getUserPhoto(userId: string): Promise<string | null> {
  const token = await getSearchAppToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/photo/$value`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    if (res.status === 404) return null; // confirmed: user has no photo
    // 429 (throttled), 5xx, etc. — transient, do not treat as "no photo"
    throw new GraphPhotoUnavailableError(res.status);
  }

  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
}

/**
 * Resolves photos for many users with bounded concurrency to avoid tripping
 * Graph throttling when checking a large batch at once (e.g. first load of a
 * users table with 100+ never-checked accounts).
 * Returns a map of userId -> photo ("" if confirmed no photo, omitted entirely
 * if the lookup failed transiently and should be retried later).
 */
export async function getUserPhotosBatch(
  userIds: string[],
  concurrency = 8,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  let index = 0;

  async function worker() {
    while (index < userIds.length) {
      const id = userIds[index++]!;
      try {
        const photo = await getUserPhoto(id);
        results.set(id, photo ?? "");
      } catch {
        // Transient failure (throttled/5xx) — leave unset so it's retried next time
        // instead of being permanently cached as "no photo".
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, userIds.length) }, worker);
  await Promise.all(workers);
  return results;
}
