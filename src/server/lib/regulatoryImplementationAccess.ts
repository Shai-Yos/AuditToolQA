import { isMemberOfGroup } from "@/server/lib/graphClient";

// Dedicated Azure AD security group ID for the Regulatory Implementation
// of Lessons Learned (RA group).
export const REGULATORY_IMPLEMENTATION_GROUP_ID = "68c13639-d086-4cb6-b8bc-2b761df040c1";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: boolean; expiresAt: number }>();

/**
 * Checks whether the given user (Azure OID) belongs to the group that grants
 * access to the Regulatory Implementation of Lessons Learned library. Result
 * is cached in-memory for a few minutes to avoid a Graph round-trip on every
 * navigation. Fails closed (denies access) if the Graph check errors.
 */
export async function hasRegulatoryImplementationAccess(azureId: string): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(azureId);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = await isMemberOfGroup(azureId, REGULATORY_IMPLEMENTATION_GROUP_ID);
  cache.set(azureId, { value, expiresAt: now + TTL_MS });
  return value;
}

/** Force a re-check on the next call (e.g. after an admin changes group membership). */
export function invalidateRegulatoryImplementationAccess(azureId: string): void {
  cache.delete(azureId);
}
