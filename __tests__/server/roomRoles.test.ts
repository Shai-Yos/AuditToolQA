import { describe, it, expect } from "vitest";
import {
  buildUserRolesFromJson,
  extractUserIdsFromJson,
  roleForChannel,
  transcriptionFrIndicesFromRole,
  canAccessTranscription,
  commFrIndicesFromRole,
  commFrIndicesFromRoleAndRooms,
  canAccessComm,
  frToBrConnectionsFromJson,
} from "@/server/lib/roomRoles";

// ─── Sample data ────────────────────────────────────────────────────────────

const sampleRoomRolesJson = JSON.stringify({
  fr: [
    {
      frIndex: 1,
      leadUserIds: ["user-a"],
      transcriptionUserIds: ["user-b", "user-c"],
      qmUserIds: ["user-d"],
    },
    {
      frIndex: 2,
      leadUserIds: ["user-a"],
      smeUserIds: ["user-e"],
      transcriptionUserIds: ["user-a"],
    },
  ],
  br: [
    {
      brIndex: 1,
      callerUserIds: ["user-f"],
      leadUserIds: ["user-a"],
      connectedFrIndices: [1, 2],
    },
    {
      brIndex: 2,
      incomingUserIds: ["user-g"],
      connectedFrIndices: [2],
    },
  ],
});

// ─── buildUserRolesFromJson ─────────────────────────────────────────────────

describe("buildUserRolesFromJson", () => {
  it("maps each user to their comma-joined roles", () => {
    const result = buildUserRolesFromJson(sampleRoomRolesJson);
    expect(result.get("user-a")).toBe("FR1 Lead, FR2 Lead, FR2 Transcription, BR1 Lead");
    expect(result.get("user-b")).toBe("FR1 Transcription");
    expect(result.get("user-f")).toBe("BR1 Caller");
  });

  it("handles empty JSON", () => {
    const result = buildUserRolesFromJson(JSON.stringify({}));
    expect(result.size).toBe(0);
  });

  it("handles custom roles", () => {
    const json = JSON.stringify({
      fr: [{ frIndex: 1, customRoles: [{ name: "Observer", userIds: ["user-x"] }] }],
    });
    const result = buildUserRolesFromJson(json);
    expect(result.get("user-x")).toBe("FR1 Observer");
  });
});

// ─── extractUserIdsFromJson ─────────────────────────────────────────────────

describe("extractUserIdsFromJson", () => {
  it("returns all unique user IDs", () => {
    const ids = extractUserIdsFromJson(sampleRoomRolesJson);
    expect(ids.sort()).toEqual(
      ["user-a", "user-b", "user-c", "user-d", "user-e", "user-f", "user-g"].sort(),
    );
  });
});

// ─── roleForChannel ─────────────────────────────────────────────────────────

describe("roleForChannel", () => {
  it("returns the matching FR role for a channel", () => {
    expect(roleForChannel("FR1 Lead, FR2 Transcription", "fr1-comm")).toBe("FR1 Lead");
    expect(roleForChannel("FR1 Lead, FR2 Transcription", "fr2-transcription")).toBe(
      "FR2 Transcription",
    );
  });

  it("returns the matching BR role for a BR channel", () => {
    expect(roleForChannel("BR1 Caller, FR1 Lead", "br1-comm")).toBe("BR1 Caller");
  });

  it("falls back to first role when no channel match", () => {
    expect(roleForChannel("FR1 Lead, FR2 QM", "fr3-comm")).toBe("FR1 Lead");
  });

  it("returns null for empty role", () => {
    expect(roleForChannel("", "fr1-comm")).toBeNull();
  });
});

// ─── transcriptionFrIndicesFromRole ─────────────────────────────────────────

describe("transcriptionFrIndicesFromRole", () => {
  it("extracts FR indices with Transcription role", () => {
    expect(transcriptionFrIndicesFromRole("FR1 Transcription, FR3 Transcription")).toEqual([1, 3]);
  });

  it("ignores non-Transcription roles", () => {
    expect(transcriptionFrIndicesFromRole("FR1 Lead, FR2 QM")).toEqual([]);
  });
});

// ─── canAccessTranscription ─────────────────────────────────────────────────

describe("canAccessTranscription", () => {
  const role = "FR1 Lead, FR2 Transcription, BR1 Caller";

  it("allows access when user has Transcription role for that FR", () => {
    expect(canAccessTranscription(role, 2)).toBe(true);
  });

  it("denies access when user only has Lead/other role", () => {
    expect(canAccessTranscription(role, 1)).toBe(false);
  });

  it("denies access for non-existent FR", () => {
    expect(canAccessTranscription(role, 99)).toBe(false);
  });
});

// ─── commFrIndicesFromRole ──────────────────────────────────────────────────

describe("commFrIndicesFromRole", () => {
  it("extracts FR indices where user has any FR role", () => {
    expect(commFrIndicesFromRole("FR1 Lead, FR2 QM, BR1 Caller").sort()).toEqual([1, 2]);
  });

  it("deduplicates indices", () => {
    expect(commFrIndicesFromRole("FR1 Lead, FR1 Transcription")).toEqual([1]);
  });
});

// ─── commFrIndicesFromRoleAndRooms ──────────────────────────────────────────

describe("commFrIndicesFromRoleAndRooms", () => {
  it("includes FR indices from BR connections", () => {
    // user has BR1 role → BR1 connects to FR1 and FR2
    const indices = commFrIndicesFromRoleAndRooms("BR1 Caller", sampleRoomRolesJson);
    expect(indices.sort()).toEqual([1, 2]);
  });

  it("merges direct FR assignments with BR connections", () => {
    const indices = commFrIndicesFromRoleAndRooms(
      "FR1 Lead, BR2 Incoming",
      sampleRoomRolesJson,
    );
    // FR1 from direct + FR2 from BR2's connectedFrIndices
    expect(indices.sort()).toEqual([1, 2]);
  });

  it("falls back to direct FR only when no roomRolesJson", () => {
    const indices = commFrIndicesFromRoleAndRooms("FR1 Lead, BR1 Caller", null);
    expect(indices).toEqual([1]);
  });
});

// ─── canAccessComm ──────────────────────────────────────────────────────────

describe("canAccessComm", () => {
  it("allows access via direct FR role", () => {
    expect(canAccessComm("FR1 Lead", 1)).toBe(true);
  });

  it("allows access via BR connection", () => {
    expect(canAccessComm("BR1 Caller", 1, sampleRoomRolesJson)).toBe(true);
  });

  it("denies access when no matching role", () => {
    expect(canAccessComm("FR2 QM", 1)).toBe(false);
  });
});

// ─── frToBrConnectionsFromJson ──────────────────────────────────────────────

describe("frToBrConnectionsFromJson", () => {
  it("maps FR indices to their connected BR indices", () => {
    const map = frToBrConnectionsFromJson(sampleRoomRolesJson);
    expect(map[1]).toEqual([1]);
    expect(map[2]!.sort()).toEqual([1, 2]);
  });

  it("returns empty object for null input", () => {
    expect(frToBrConnectionsFromJson(null)).toEqual({});
  });

  it("returns empty object for invalid JSON", () => {
    expect(frToBrConnectionsFromJson("not json")).toEqual({});
  });
});
