/**
 * Unit tests for the chat API route authorization logic.
 *
 * We mock `requireUser`, `getCachedAuditPrivilege`, and `db` to test
 * the permission checks without a real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/server/helpers/currentUser", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/server/lib/userPrivilegeCache", () => ({
  getCachedAuditPrivilege: vi.fn(),
}));

vi.mock("@/server/helpers/notifications", () => ({
  createNotifications: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    chatMessage: {
      create: vi.fn().mockResolvedValue({
        id: "msg-1",
        createdAt: new Date(),
        editedAt: null,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "msg-1", authorName: "Owner", text: "edited", createdAt: new Date(), editedAt: new Date() }),
      delete: vi.fn().mockResolvedValue({}),
    },
    audit: {
      findUnique: vi.fn(),
    },
  },
}));

import { requireUser } from "@/server/helpers/currentUser";
import { getCachedAuditPrivilege } from "@/server/lib/userPrivilegeCache";
import { db } from "@/server/db";
import { POST, PATCH, DELETE } from "@/app/api/audits/[auditId]/chat/route";

const mockRequireUser = vi.mocked(requireUser);
const mockGetPrivilege = vi.mocked(getCachedAuditPrivilege);
// Cast to any: Prisma's generic function types don't expose vi mock methods at compile time,
// but at runtime the vi.mock factory replaces them with vi.fn() instances.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = db as any;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3001/api/audits/audit-1/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const paramsPromise = Promise.resolve({ auditId: "audit-1" });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/audits/[auditId]/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));

    const res = await POST(makeRequest({ channel: "fr1-comm", text: "hello" }), {
      params: paramsPromise,
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when channel or text is missing", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-1",
      email: "admin@test.com",
      name: "Admin",
      role: "ADMIN",
      image: null,
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ channel: "", text: "hello" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(400);
  });

  it("allows ADMIN to post without assignment check", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-1",
      email: "admin@test.com",
      name: "Admin",
      role: "ADMIN",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: null,
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });

    const res = await POST(makeRequest({ channel: "fr1-comm", text: "hello" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(200);
  });

  it("allows ADMIN to post to transcription channel", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-2",
      email: "admin2@test.com",
      name: "Admin2",
      role: "ADMIN",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: null,
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });

    const res = await POST(makeRequest({ channel: "fr1-transcription", text: "notes" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 when regular user is not assigned to audit", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-3",
      email: "user@test.com",
      name: "User",
      role: "USER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: null,
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });

    const res = await POST(makeRequest({ channel: "fr1-comm", text: "hello" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Not authorized for this audit");
  });

  it("returns 403 when user lacks transcription access for that FR", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-3",
      email: "user@test.com",
      name: "User",
      role: "USER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: { role: "FR1 Lead, FR2 QM" },
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });

    const res = await POST(makeRequest({ channel: "fr1-transcription", text: "notes" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Transcription access denied");
  });

  it("allows user with transcription role for the correct FR", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-3",
      email: "user@test.com",
      name: "User",
      role: "USER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: { role: "FR2 Transcription" },
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });

    const res = await POST(makeRequest({ channel: "fr2-transcription", text: "notes" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 when user lacks comm access for that FR", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-3",
      email: "user@test.com",
      name: "User",
      role: "USER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: { role: "FR1 Lead" },
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });

    const res = await POST(makeRequest({ channel: "fr2-comm", text: "hello" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Not assigned to this room");
  });

  // ─── AUDIT_OWNER tests ───────────────────────────────────────────────────

  it("allows AUDIT_OWNER who owns the audit to post without assignment check", async () => {
    mockRequireUser.mockResolvedValue({
      id: "owner-1",
      email: "owner@test.com",
      name: "Owner",
      role: "AUDIT_OWNER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: null,
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });
    mockDb.audit.findUnique.mockResolvedValue({ createdById: "owner-1" } as never);

    const res = await POST(makeRequest({ channel: "fr1-comm", text: "hello" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(200);
  });

  it("allows AUDIT_OWNER assigned to (but not owning) an audit to post", async () => {
    mockRequireUser.mockResolvedValue({
      id: "owner-2",
      email: "owner2@test.com",
      name: "Owner2",
      role: "AUDIT_OWNER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: { role: "FR1 Lead" },
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });
    // Different user owns this audit
    mockDb.audit.findUnique.mockResolvedValue({ createdById: "other-owner" } as never);

    const res = await POST(makeRequest({ channel: "fr1-comm", text: "hello" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 when AUDIT_OWNER does not own and is not assigned to the audit", async () => {
    mockRequireUser.mockResolvedValue({
      id: "owner-2",
      email: "owner2@test.com",
      name: "Owner2",
      role: "AUDIT_OWNER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: null,
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });
    // Different user owns this audit
    mockDb.audit.findUnique.mockResolvedValue({ createdById: "other-owner" } as never);

    const res = await POST(makeRequest({ channel: "fr1-comm", text: "hello" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Not authorized for this audit");
  });
});

// ─── AUDIT_OWNER: access guards ──────────────────────────────────────────────

describe("requireAdmin / requireAuditOwner role guards", () => {
  // These are tested indirectly through the chat route's AUDIT_OWNER ownership
  // logic, but we can verify the correct 403 shape for each scenario.

  it("AUDIT_OWNER is blocked from comm channel of an audit they do not own and are not assigned to", async () => {
    mockRequireUser.mockResolvedValue({
      id: "owner-x",
      email: "ownerx@test.com",
      name: "OwnerX",
      role: "AUDIT_OWNER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: null,
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });
    mockDb.audit.findUnique.mockResolvedValue({ createdById: "someone-else" } as never);

    const res = await POST(
      new NextRequest("http://localhost:3001/api/audits/audit-99/chat", {
        method: "POST",
        body: JSON.stringify({ channel: "fr1-comm", text: "hi" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ auditId: "audit-99" }) },
    );

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("Not authorized for this audit");
  });

  it("AUDIT_OWNER who owns the audit is treated as admin (no room-role checks)", async () => {
    mockRequireUser.mockResolvedValue({
      id: "owner-x",
      email: "ownerx@test.com",
      name: "OwnerX",
      role: "AUDIT_OWNER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: null,
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });
    mockDb.audit.findUnique.mockResolvedValue({ createdById: "owner-x" } as never);

    // Transcription channel — would be denied for a regular user with no transcription role
    const res = await POST(
      new NextRequest("http://localhost:3001/api/audits/audit-99/chat", {
        method: "POST",
        body: JSON.stringify({ channel: "fr3-transcription", text: "notes" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ auditId: "audit-99" }) },
    );

    expect(res.status).toBe(200);
  });
});

// ─── AUDIT_OWNER: DELETE message ─────────────────────────────────────────────

describe("DELETE /api/audits/[auditId]/chat — AUDIT_OWNER", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows AUDIT_OWNER who owns the audit to delete any message", async () => {
    mockRequireUser.mockResolvedValue({
      id: "owner-1",
      email: "owner@test.com",
      name: "Owner",
      role: "AUDIT_OWNER",
      image: null,
      createdAt: new Date(),
    });
    mockDb.chatMessage.findUnique.mockResolvedValue({
      id: "msg-1",
      auditId: "audit-1",
      authorId: "some-other-user",
      channel: "fr1-comm",
    } as never);
    mockDb.audit.findUnique.mockResolvedValue({ createdById: "owner-1" } as never);

    const res = await DELETE(
      new NextRequest("http://localhost:3001/api/audits/audit-1/chat", {
        method: "DELETE",
        body: JSON.stringify({ messageId: "msg-1" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ auditId: "audit-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("blocks AUDIT_OWNER who does not own the audit from deleting another user's message", async () => {
    mockRequireUser.mockResolvedValue({
      id: "owner-2",
      email: "owner2@test.com",
      name: "Owner2",
      role: "AUDIT_OWNER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: null,
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });
    mockDb.chatMessage.findUnique.mockResolvedValue({
      id: "msg-1",
      auditId: "audit-1",
      authorId: "some-other-user",
      channel: "fr1-comm",
    } as never);
    mockDb.audit.findUnique.mockResolvedValue({ createdById: "other-owner" } as never);

    const res = await DELETE(
      new NextRequest("http://localhost:3001/api/audits/audit-1/chat", {
        method: "DELETE",
        body: JSON.stringify({ messageId: "msg-1" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ auditId: "audit-1" }) },
    );

    expect(res.status).toBe(403);
  });

  it("allows AUDIT_OWNER to delete their own message in any audit", async () => {
    mockRequireUser.mockResolvedValue({
      id: "owner-2",
      email: "owner2@test.com",
      name: "Owner2",
      role: "AUDIT_OWNER",
      image: null,
      createdAt: new Date(),
    });
    mockDb.chatMessage.findUnique.mockResolvedValue({
      id: "msg-1",
      auditId: "audit-1",
      authorId: "owner-2",   // <-- same as current user
      channel: "fr1-comm",
    } as never);
    mockDb.audit.findUnique.mockResolvedValue({ createdById: "other-owner" } as never);

    const res = await DELETE(
      new NextRequest("http://localhost:3001/api/audits/audit-1/chat", {
        method: "DELETE",
        body: JSON.stringify({ messageId: "msg-1" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ auditId: "audit-1" }) },
    );

    expect(res.status).toBe(200);
  });
});

// ─── Transcriptionist: write access to transcription channel ─────────────────

describe("Transcriptionist role — transcription channel write access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a user whose roomRolesJson gives them Transcription access to post to that FR's transcription channel", async () => {
    const roomRolesJson = JSON.stringify({
      fr: [{ frIndex: 2, transcriptionUserIds: ["user-t"] }],
      br: [],
    });

    mockRequireUser.mockResolvedValue({
      id: "user-t",
      email: "transcriptionist@test.com",
      name: "Transcriptionist",
      role: "USER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: { role: "FR2 QM" }, // base DB role — different FR than transcription check
      roomRolesJson,
      auditTitle: "Test Audit",
    });

    const res = await POST(makeRequest({ channel: "fr2-transcription", text: "my notes" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(200);
  });

  it("denies a user whose roomRolesJson gives Transcription access to a different FR", async () => {
    const roomRolesJson = JSON.stringify({
      fr: [{ frIndex: 1, transcriptionUserIds: ["user-t"] }],
      br: [],
    });

    mockRequireUser.mockResolvedValue({
      id: "user-t",
      email: "transcriptionist@test.com",
      name: "Transcriptionist",
      role: "USER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: { role: "FR1 QM" },
      roomRolesJson,
      auditTitle: "Test Audit",
    });

    // Has transcription for FR1, trying to post to FR2
    const res = await POST(makeRequest({ channel: "fr2-transcription", text: "wrong room" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("Transcription access denied");
  });

  it("allows a user with assignee role FR1 Transcription (no roomRolesJson) to post to fr1-transcription", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-t2",
      email: "t2@test.com",
      name: "T2",
      role: "USER",
      image: null,
      createdAt: new Date(),
    });
    mockGetPrivilege.mockResolvedValue({
      assignee: { role: "FR1 Transcription" },
      roomRolesJson: null,
      auditTitle: "Test Audit",
    });

    const res = await POST(makeRequest({ channel: "fr1-transcription", text: "notes" }), {
      params: paramsPromise,
    });
    expect(res.status).toBe(200);
  });
});
