import { isMemberOfGroup } from "@/server/lib/graphClient";
import { db } from "@/server/db";

// Dedicated Azure AD security group ID for the Regulatory Implementation
// of Lessons Learned (RA group).
export const REGULATORY_IMPLEMENTATION_GROUP_ID = "68c13639-d086-4cb6-b8bc-2b761df040c1";

type RegulatoryAccessOptions = {
  allowGraphFallback?: boolean;
};

/**
 * Checks whether the given user has access to the Regulatory Implementation.
 * First checks if user was assigned the RA group at login (stored in DB).
 * Falls back to Graph API check for users who logged in before this was added.
 */
export async function hasRegulatoryImplementationAccess(
  azureId: string,
  options: RegulatoryAccessOptions = {},
): Promise<boolean> {
  const { allowGraphFallback = true } = options;

  // Check DB first (set at login time if user has RA group)
  try {
    const user = await db.user.findUnique({
      where: { id: azureId },
      select: { regulatoryImplementationAccess: true },
    });
    if (user?.regulatoryImplementationAccess) return true;
    if (!allowGraphFallback) return false;
  } catch {
    if (!allowGraphFallback) return false;
    // DB check failed, fall back to Graph API
  }

  // Fallback: check via Graph API (for backward compatibility)
  const value = await isMemberOfGroup(azureId, REGULATORY_IMPLEMENTATION_GROUP_ID);
  return value;
}

/** Force a re-check on the next call (e.g. after group membership changes). */
export function invalidateRegulatoryImplementationAccess(azureId: string): void {
  // No cache to invalidate with DB-based approach
}
