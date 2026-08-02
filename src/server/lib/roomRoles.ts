/**
 * Helpers for working with audit roomRolesJson.
 *
 * Role strings stored in AuditAssignee.role use the format:
 *   "FR1 Lead, FR2 Transcription, BR1 Caller"
 */

type CustomRoleEntry = { name: string; userIds: string[] };

type RoomRoles = {
  fr?: Array<{
    frIndex: number;
    leadUserIds?: string[];
    qmUserIds?: string[];
    smeUserIds?: string[];
    transcriptionUserIds?: string[];
    customRoles?: CustomRoleEntry[];
  }>;
  br?: Array<{
    brIndex: number;
    leadUserIds?: string[];
    callerUserIds?: string[];
    qmUserIds?: string[];
    qualityReviewerUserIds?: string[];
    smePrepUserIds?: string[];
    outgoingUserIds?: string[];
    incomingUserIds?: string[];
    recordsPrepUserIds?: string[];
    connectedFrIndices?: number[];
    customRoles?: CustomRoleEntry[];
  }>;
};

function splitAssigneeRoles(assigneeRole: string): string[] {
  return assigneeRole
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Build a map of userId → comma-joined role labels from roomRolesJson.
 * e.g. { "user1": "FR1 Lead, FR2 Transcription" }
 */
export function buildUserRolesFromJson(roomRolesJson: string): Map<string, string> {
  const userRoles = new Map<string, Set<string>>();
  const add = (id: string, role: string) => {
    if (!userRoles.has(id)) userRoles.set(id, new Set());
    userRoles.get(id)!.add(role);
  };

  const parsed = JSON.parse(roomRolesJson) as RoomRoles;

  for (const fr of parsed.fr ?? []) {
    const p = `FR${fr.frIndex}`;
    fr.leadUserIds?.forEach((id) => add(id, `${p} Lead`));
    fr.qmUserIds?.forEach((id) => add(id, `${p} QM`));
    fr.smeUserIds?.forEach((id) => add(id, `${p} SME`));
    fr.transcriptionUserIds?.forEach((id) => add(id, `${p} Transcription`));
    for (const cr of fr.customRoles ?? []) {
      cr.userIds?.forEach((id) => add(id, `${p} ${cr.name}`));
    }
  }
  for (const br of parsed.br ?? []) {
    const p = `BR${br.brIndex}`;
    br.leadUserIds?.forEach((id) => add(id, `${p} Lead`));
    br.callerUserIds?.forEach((id) => add(id, `${p} Caller`));
    br.qmUserIds?.forEach((id) => add(id, `${p} QM`));
    br.qualityReviewerUserIds?.forEach((id) => add(id, `${p} Quality Reviewer`));
    br.smePrepUserIds?.forEach((id) => add(id, `${p} SME Prep`));
    br.outgoingUserIds?.forEach((id) => add(id, `${p} Outgoing`));
    br.incomingUserIds?.forEach((id) => add(id, `${p} Incoming`));
    br.recordsPrepUserIds?.forEach((id) => add(id, `${p} Records Prep`));
    for (const cr of br.customRoles ?? []) {
      cr.userIds?.forEach((id) => add(id, `${p} ${cr.name}`));
    }
  }

  const result = new Map<string, string>();
  for (const [id, roles] of userRoles) {
    result.set(id, Array.from(roles).join(", "));
  }
  return result;
}

/**
 * Returns unique user IDs present in roomRolesJson.
 */
export function extractUserIdsFromJson(roomRolesJson: string): string[] {
  return Array.from(buildUserRolesFromJson(roomRolesJson).keys());
}

/**
 * Given an AuditAssignee.role string and a channel name (e.g. "fr2-comm"),
 * returns the most relevant role label for display in chat.
 * Falls back to the first role if no channel-specific role is found.
 */
export function roleForChannel(assigneeRole: string, channel: string): string | null {
  if (!assigneeRole) return null;
  const roles = splitAssigneeRoles(assigneeRole);
  if (roles.length === 0) return null;

  // Try to match the channel's FR/BR number
  const frMatch = /^fr(\d+)-/.exec(channel);
  const brMatch = /^br(\d+)-/.exec(channel);
  const prefix = frMatch ? `FR${frMatch[1]} ` : brMatch ? `BR${brMatch[1]} ` : null;

  if (prefix) {
    const normalizedPrefix = prefix.toUpperCase();
    const specific = roles.find((r) => r.toUpperCase().startsWith(normalizedPrefix));
    if (specific) return specific;
  }

  return roles[0] ?? null;
}

/**
 * Returns the FR indices for which a user has Transcription access,
 * derived from their AuditAssignee.role string.
 */
export function transcriptionFrIndicesFromRole(assigneeRole: string): number[] {
  return splitAssigneeRoles(assigneeRole)
    .flatMap((r) => {
      const m = /^FR(\d+)\s+Transcription$/i.exec(r);
      return m ? [parseInt(m[1]!, 10)] : [];
    });
}

/**
 * Returns true if the given AuditAssignee.role grants transcription access for frNum.
 */
export function canAccessTranscription(assigneeRole: string, frNum: number): boolean {
  return transcriptionFrIndicesFromRole(assigneeRole).includes(frNum);
}

/**
 * Returns the FR indices for which a user has any assigned role
 * (Lead, QM, SME, or Transcription), granting access to that FR's comm channel.
 */
export function commFrIndicesFromRole(assigneeRole: string): number[] {
  const indices = new Set<number>();
  for (const r of splitAssigneeRoles(assigneeRole)) {
    const m = /^FR(\d+)\s+/i.exec(r);
    if (m) indices.add(parseInt(m[1]!, 10));
  }
  return Array.from(indices);
}

export function commFrIndicesFromRoleAndRooms(
  assigneeRole: string,
  roomRolesJson: string | null | undefined,
): number[] {
  const indices = new Set(commFrIndicesFromRole(assigneeRole));

  if (!roomRolesJson) return Array.from(indices);

  try {
    const parsed = JSON.parse(roomRolesJson) as RoomRoles;
    for (const r of splitAssigneeRoles(assigneeRole)) {
      const brMatch = /^BR(\d+)\s+/i.exec(r);
      if (!brMatch) continue;
      const brIndex = parseInt(brMatch[1]!, 10);
      const br = parsed.br?.find((entry) => entry.brIndex === brIndex);
      for (const frIdx of br?.connectedFrIndices ?? []) {
        indices.add(frIdx);
      }
    }
  } catch {
    // Ignore malformed roomRolesJson and fall back to direct FR assignments only.
  }

  return Array.from(indices);
}

/**
 * Returns true if the given AuditAssignee.role grants access to the comm channel for frNum.
 */
export function canAccessComm(
  assigneeRole: string,
  frNum: number,
  roomRolesJson?: string | null,
): boolean {
  return commFrIndicesFromRoleAndRooms(assigneeRole, roomRolesJson).includes(frNum);
}

/**
 * Builds a map of frIndex → brIndices that connect to it, derived from
 * the `connectedFrIndices` field on each BR in roomRolesJson.
 *
 * Example: BR1 connects to FR1 and FR2 → { 1: [1], 2: [1] }
 */
export function frToBrConnectionsFromJson(roomRolesJson: string | null): Record<number, number[]> {
  if (!roomRolesJson) return {};
  try {
    const parsed = JSON.parse(roomRolesJson) as RoomRoles;
    const map: Record<number, number[]> = {};
    for (const br of parsed.br ?? []) {
      for (const frIdx of br.connectedFrIndices ?? []) {
        if (!map[frIdx]) map[frIdx] = [];
        if (!map[frIdx]!.includes(br.brIndex)) map[frIdx]!.push(br.brIndex);
      }
    }
    return map;
  } catch {
    return {};
  }
}
