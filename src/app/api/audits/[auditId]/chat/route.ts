import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import {
  roleForChannel,
  canAccessTranscription,
  canAccessComm,
  buildUserRolesFromJson,
} from "@/server/lib/roomRoles";
import { createNotifications } from "@/server/helpers/notifications";
import { getCachedAuditPrivilege } from "@/server/lib/userPrivilegeCache";
import { emitAuditEvent } from "@/server/lib/event-bus";
import { getUserPhoto } from "@/server/lib/graphClient";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channel = req.nextUrl.searchParams.get("channel") ?? "";
  const after = req.nextUrl.searchParams.get("after");

  // All authenticated users can read chat messages (even if not assigned)

  const afterDate = after ? new Date(after) : null;

  const messages = await db.chatMessage.findMany({
    where: {
      auditId,
      channel,
      ...(afterDate
        ? { OR: [{ createdAt: { gt: afterDate } }, { editedAt: { gt: afterDate } }] }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // Fast-path: no messages → return empty array immediately
  if (messages.length === 0) {
    return NextResponse.json([], {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  }

  // Collect unique author IDs to look up current images & roles
  const authorIds = [...new Set(messages.map((m) => m.authorId))];
  const [users, assignees] = await Promise.all([
    db.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, image: true, name: true, role: true },
    }),
    db.auditAssignee.findMany({
      where: { auditId, userId: { in: authorIds } },
      select: { userId: true, role: true },
    }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const assigneeMap = new Map(assignees.map((a) => [a.userId, a]));

  return NextResponse.json(
    messages.map((m) => {
      const liveUser = userMap.get(m.authorId);
      const liveAssignee = assigneeMap.get(m.authorId);
      const liveRole = liveUser?.role === "ADMIN"
        ? "Admin"
        : liveAssignee
          ? roleForChannel(liveAssignee.role, channel)
          : m.authorRole;
      return {
        id: m.id,
        authorName: liveUser?.name ?? m.authorName,
        authorImage: liveUser?.image ?? m.authorImage ?? undefined,
        authorRole: liveRole ?? m.authorRole ?? undefined,
        time: m.createdAt.toISOString(),
        text: m.text,
        fileUrl: m.fileUrl
          ? m.fileUrl.startsWith("onedrive:/AuditTool/")
            ? `/api/uploads/${m.fileUrl.replace("onedrive:/AuditTool/", "")}`
            : m.fileUrl
          : undefined,
        fileName: m.fileName ?? undefined,
        fileMime: m.fileMime ?? undefined,
        fileSize: m.fileSize ?? undefined,
        mentions: m.mentions ? (JSON.parse(m.mentions) as string[]) : undefined,
        editedAt: m.editedAt?.toISOString() ?? null,
        replyTo: m.replyToId ? {
          id: m.replyToId,
          authorName: m.replyToAuthorName ?? "",
          text: m.replyToText ?? "",
        } : null,
      };
    }),
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { channel?: string; text?: string; mentionedUserIds?: string[]; replyToId?: string; replyToAuthorName?: string; replyToText?: string };
  const channel = (body.channel ?? "").trim();
  const text = (body.text ?? "").trim();
  const mentionedUserIds: string[] = Array.isArray(body.mentionedUserIds)
    ? body.mentionedUserIds.filter((id): id is string => typeof id === "string").slice(0, 50)
    : [];
  const replyToId = typeof body.replyToId === "string" ? body.replyToId.trim().slice(0, 100) : undefined;
  const replyToAuthorName = typeof body.replyToAuthorName === "string" ? body.replyToAuthorName.trim().slice(0, 200) : undefined;
  const replyToText = typeof body.replyToText === "string" ? body.replyToText.slice(0, 2000) : undefined;

  if (!channel || !text) {
    return NextResponse.json({ error: "channel and text are required" }, { status: 400 });
  }

  // Use cached privilege data (refreshed every ~5 min) to avoid DB queries on every message
  const privilege = await getCachedAuditPrivilege(user.id, auditId);

  // AUDIT_OWNER: use createdById from privilege cache — avoids an extra DB round-trip
  const isAuditOwnerOfThis =
    user.role === "AUDIT_OWNER" && privilege.createdById === user.id;

  let effectiveRole = "";
  if (user.role !== "ADMIN" && !isAuditOwnerOfThis) {
    if (!privilege.assignee) {
      return NextResponse.json({ error: "Not authorized for this audit" }, { status: 403 });
    }

    effectiveRole = privilege.roomRolesJson
      ? buildUserRolesFromJson(privilege.roomRolesJson).get(user.id) ?? privilege.assignee.role
      : privilege.assignee.role;

    if (channel.endsWith("-transcription")) {
      const frNum = parseInt(channel.replace("fr", "").replace("-transcription", ""), 10);
      if (!canAccessTranscription(effectiveRole, frNum)) {
        return NextResponse.json({ error: "Transcription access denied" }, { status: 403 });
      }
    }
    if (channel.endsWith("-comm")) {
      const frNum = parseInt(channel.replace("fr", "").replace("-comm", ""), 10);
      if (!canAccessComm(effectiveRole, frNum, privilege.roomRolesJson)) {
        return NextResponse.json({ error: "Not assigned to this room" }, { status: 403 });
      }
    }
  }

  // Determine the author's role label for display in chat
  const authorRole: string | null = (user.role === "ADMIN" || isAuditOwnerOfThis)
    ? "Admin"
    : roleForChannel(effectiveRole, channel);

  // For transcription channels, reuse existing message instead of creating duplicates
  if (channel.endsWith("-transcription")) {
    const existing = await db.chatMessage.findFirst({
      where: { auditId, channel },
      orderBy: { createdAt: "desc" },
      select: { id: true, authorName: true, text: true },
    });
    if (existing) {
      // Reuse existing transcription message — only update text, don't touch authorName
      // (authorName is managed exclusively by PATCH to avoid duplicates)
      const updated = await db.chatMessage.update({
        where: { id: existing.id },
        data: { text, editedAt: new Date() },
      });
      return NextResponse.json({
        ok: true,
        message: {
          id: updated.id,
          authorName: updated.authorName,
          authorImage: undefined as string | undefined,
          authorRole,
          time: updated.createdAt.toISOString(),
          text: updated.text,
          editedAt: updated.editedAt?.toISOString() ?? null,
        },
      });
    }
  }

  const message = await db.chatMessage.create({
    data: {
      auditId,
      auditName: privilege.auditTitle,
      channel,
      authorId: user.id,
      authorName: user.name ?? user.email ?? "Unknown",
      authorImage: null, // resolved live from User table on read — avoids writing ~100KB base64 per message
      authorRole,
      text,
      mentions: mentionedUserIds.length > 0 ? JSON.stringify(mentionedUserIds) : null,
      ...(replyToId ? { replyToId, replyToAuthorName, replyToText } : {}),
    },
  });

  // Fire-and-forget: back-fill photo if the user has none stored yet
  void db.user.findUnique({ where: { id: user.id }, select: { image: true } }).then((u) => {
    if (!u?.image) {
      return getUserPhoto(user.id).then((image) => {
        if (image) return db.user.update({ where: { id: user.id }, data: { image } });
      });
    }
  }).catch(() => {});

  // Fire-and-forget: send notifications in background so POST returns immediately
  void (async () => {
    try {
      const [auditAssignees, adminUsers] = await Promise.all([
        db.auditAssignee.findMany({
          where: { auditId },
          select: { userId: true },
        }),
        db.user.findMany({
          where: { role: "ADMIN" },
          select: { id: true },
        }),
      ]);

      const allIds = [
        ...new Set([
          ...auditAssignees.map((a) => a.userId),
          ...adminUsers.map((u) => u.id),
        ]),
      ].filter((id) => id !== user.id);

      const authorName = user.name ?? user.email ?? "Unknown";
      const auditTitle = privilege.auditTitle || "Audit";
      const truncatedText = text.length > 80 ? text.slice(0, 80) + "…" : text;

      if (allIds.length > 0) {
        await createNotifications(
          allIds.map((userId) => ({
            userId,
            type: "CHAT_MESSAGE" as const,
            title: `New message in ${auditTitle}`,
            message: `${authorName}: ${truncatedText}`,
            linkAdmin: `/adminDashboard/audits/${auditId}/chats?channel=${encodeURIComponent(channel)}`,
            linkUser: `/userDashboard/audits/${auditId}/chats?channel=${encodeURIComponent(channel)}`,
          })),
        );
      }

      // Send targeted mention notifications (higher priority, separate type)
      const validMentionIds = mentionedUserIds.filter((id) => id !== user.id);
      if (validMentionIds.length > 0) {
        await createNotifications(
          validMentionIds.map((userId) => ({
            userId,
            type: "CHAT_MENTION" as const,
            title: `${authorName} mentioned you in ${auditTitle}`,
            message: truncatedText,
            linkAdmin: `/adminDashboard/audits/${auditId}/chats?channel=${encodeURIComponent(channel)}`,
            linkUser: `/userDashboard/audits/${auditId}/chats?channel=${encodeURIComponent(channel)}`,
          })),
        );
      }

      // Send reply notification to the original message's author
      if (replyToId) {
        const originalMsg = await db.chatMessage.findUnique({
          where: { id: replyToId },
          select: { authorId: true },
        });
        if (originalMsg && originalMsg.authorId !== user.id && !validMentionIds.includes(originalMsg.authorId)) {
          await createNotifications([{
            userId: originalMsg.authorId,
            type: "CHAT_REPLY" as const,
            title: `${authorName} replied to you in ${auditTitle}`,
            message: truncatedText,
            linkAdmin: `/adminDashboard/audits/${auditId}/chats?channel=${encodeURIComponent(channel)}`,
            linkUser: `/userDashboard/audits/${auditId}/chats?channel=${encodeURIComponent(channel)}`,
          }]);
        }
      }
    } catch {
      // Never let notification crash anything
    }
  })();

  emitAuditEvent(auditId, "chat");

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      authorName: message.authorName,
      authorImage: message.authorImage ?? undefined,
      authorRole: message.authorRole ?? undefined,
      time: message.createdAt.toISOString(),
      text: message.text,
      mentions: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
      replyTo: replyToId ? { id: replyToId, authorName: replyToAuthorName ?? "", text: replyToText ?? "" } : null,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId, text } = (await req.json()) as { messageId?: string; text?: string };
  if (!messageId || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "messageId and text are required" }, { status: 400 });
  }

  const message = await db.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, auditId: true, authorId: true, authorName: true, channel: true, text: true },
  });

  if (!message || message.auditId !== auditId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // AUDIT_OWNER: use createdById from privilege cache — avoids an extra DB round-trip
  const privilege = await getCachedAuditPrivilege(user.id, auditId);
  const isOwnerForPatch =
    user.role === "AUDIT_OWNER" && privilege.createdById === user.id;

  // Only admin/audit-owner or transcription-assigned users can edit transcription notes.
  if (message.channel.endsWith("-transcription")) {
    if (user.role !== "ADMIN" && !isOwnerForPatch) {
      const frNum = parseInt(message.channel.replace("fr", "").replace("-transcription", ""), 10);

      if (!privilege.assignee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const effectiveRole = privilege.roomRolesJson
        ? buildUserRolesFromJson(privilege.roomRolesJson).get(user.id) ?? privilege.assignee.role
        : privilege.assignee.role;

      if (!canAccessTranscription(effectiveRole, frNum)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else if (message.authorId !== user.id && user.role !== "ADMIN" && !isOwnerForPatch) {
    // For non-transcription channels, only allow author, admin, or audit owner to edit.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // For transcription channels, preserve request snippets that were appended
  // server-side (by request creation) while the scribe was typing.
  let finalText = text.trim();
  if (message.channel.endsWith("-transcription")) {
    const snippetPattern = /<hr><p><strong>New request:<\/strong>.*?<\/p><hr>/g;
    // Extract request IDs from snippet URLs to compare by identity, not HTML string
    const extractRequestIds = (html: string): Set<string> => {
      const ids = new Set<string>();
      const matches = html.match(snippetPattern) ?? [];
      for (const m of matches) {
        const idMatch = /\/api\/requests\/([^/"]+)\/view/.exec(m);
        if (idMatch) ids.add(idMatch[1]!);
      }
      return ids;
    };
    const incomingRequestIds = extractRequestIds(finalText);
    const dbSnippets = message.text.match(snippetPattern) ?? [];
    const missingSnippets = dbSnippets.filter((s) => {
      const idMatch = /\/api\/requests\/([^/"]+)\/view/.exec(s);
      return idMatch && !incomingRequestIds.has(idMatch[1]!);
    });
    if (missingSnippets.length > 0) {
      finalText = finalText + missingSnippets.join("");
    }
  }

  // For transcription channels, accumulate contributor names in authorName
  // Uses " | " as delimiter since names may contain commas (e.g. "Last, First")
  let updatedAuthorName = message.authorName;

  if (message.channel.endsWith("-transcription")) {
    const currentUserName = (user.name ?? user.email ?? "Unknown").trim();

    // Parse existing contributors (split by " | " or treat whole string as one name)
    const names = message.authorName.includes(" | ")
      ? message.authorName.split(" | ").map((n) => n.trim()).filter(Boolean)
      : message.authorName.trim() ? [message.authorName.trim()] : [];

    // Deduplicate and add current user if not already present
    const uniqueNames = [...new Set(names)];
    if (!uniqueNames.includes(currentUserName)) {
      uniqueNames.push(currentUserName);
    }
    updatedAuthorName = uniqueNames.join(" | ");
  }

  const updated = await db.chatMessage.update({
    where: { id: messageId },
    data: { text: finalText, editedAt: new Date(), authorName: updatedAuthorName },
  });

  emitAuditEvent(auditId, "chat");

  return NextResponse.json({
    ok: true,
    message: {
      id: updated.id,
      authorName: updated.authorName,
      authorImage: updated.authorImage ?? undefined,
      authorRole: updated.authorRole ?? undefined,
      time: updated.createdAt.toISOString(),
      text: updated.text,
      editedAt: updated.editedAt?.toISOString() ?? null,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = (await req.json()) as { messageId?: string };
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const message = await db.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, auditId: true, authorId: true, channel: true },
  });

  if (!message || message.auditId !== auditId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // AUDIT_OWNER: use createdById from privilege cache — avoids an extra DB round-trip
  const privilegeForDelete = await getCachedAuditPrivilege(user.id, auditId);
  const isOwnerForDelete =
    user.role === "AUDIT_OWNER" && privilegeForDelete.createdById === user.id;

  // Only admin/audit-owner or transcription-assigned users can delete transcription notes.
  if (message.channel.endsWith("-transcription")) {
    if (user.role !== "ADMIN" && !isOwnerForDelete) {
      const frNum = parseInt(message.channel.replace("fr", "").replace("-transcription", ""), 10);

      if (!privilegeForDelete.assignee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const effectiveRole = privilegeForDelete.roomRolesJson
        ? buildUserRolesFromJson(privilegeForDelete.roomRolesJson).get(user.id) ?? privilegeForDelete.assignee.role
        : privilegeForDelete.assignee.role;

      if (!canAccessTranscription(effectiveRole, frNum)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else if (message.authorId !== user.id && user.role !== "ADMIN" && !isOwnerForDelete) {
    // For non-transcription channels, only allow author, admin, or audit owner to delete.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.chatMessage.delete({ where: { id: messageId } });

  emitAuditEvent(auditId, "chat");

  return NextResponse.json({ ok: true });
}
