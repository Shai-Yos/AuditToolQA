import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { existsSync } from "fs";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { canAccessTranscription, canAccessComm, roleForChannel } from "@/server/lib/roomRoles";
import { createNotifications } from "@/server/helpers/notifications";
import { getCachedAuditPrivilege } from "@/server/lib/userPrivilegeCache";
import { uploadFile } from "@/server/lib/oneDriveClient";
import { emitAuditEvent } from "@/server/lib/event-bus";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
]);

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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const channel = String(formData.get("channel") ?? "").trim();
  const file = formData.get("file");

  if (!channel || !(file instanceof Blob)) {
    return NextResponse.json({ error: "channel and file are required" }, { status: 400 });
  }

  const fileName = String(formData.get("fileName") ?? (file as Blob & { name?: string }).name ?? "file");
  const caption = String(formData.get("caption") ?? "").trim();

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
  }

  // Access check — use cached privilege data
  const privilege = await getCachedAuditPrivilege(user.id, auditId);

  // AUDIT_OWNER: check if they own this audit
  let isAuditOwnerOfThis = false;
  if (user.role === "AUDIT_OWNER") {
    const ownerCheck = await db.audit.findUnique({ where: { id: auditId }, select: { createdById: true } });
    isAuditOwnerOfThis = ownerCheck?.createdById === user.id;
  }

  if (user.role !== "ADMIN" && !isAuditOwnerOfThis) {
    if (!privilege.assignee) {
      return NextResponse.json({ error: "Not authorized for this audit" }, { status: 403 });
    }

    if (channel.endsWith("-transcription")) {
      const frNum = parseInt(channel.replace("fr", "").replace("-transcription", ""), 10);
      if (!canAccessTranscription(privilege.assignee.role, frNum)) {
        return NextResponse.json({ error: "Transcription access denied" }, { status: 403 });
      }
    }

    if (channel.endsWith("-comm")) {
      const frNum = parseInt(channel.replace("fr", "").replace("-comm", ""), 10);
      if (!canAccessComm(privilege.assignee.role, frNum, privilege.roomRolesJson)) {
        return NextResponse.json({ error: "Not assigned to this room" }, { status: 403 });
      }
    }
  }

  // Determine role label
  const authorRole: string | null =
    (user.role === "ADMIN" || isAuditOwnerOfThis) ? "Admin" : roleForChannel(privilege.assignee!.role, channel);

  // Save file — OneDrive: /AuditTool/Audits/[Audit name]/Chat/[file]
  // Local fallback: public/uploads/[auditSlug]/chats/[channelSlug]/[file]
  const baseTitle = privilege.auditTitle || auditId;
  const auditTitle = privilege.auditTrackId ? `${privilege.auditTrackId} ${baseTitle}` : baseTitle;
  const auditSlug = auditTitle.trim().replace(/[\/\\:*?"<>|]/g, "_").substring(0, 100) || auditId;
  const channelSlug = channel.replace(/[\/\\:*?"<>|]/g, "_");
  const localDir = join(process.cwd(), "public", "uploads", auditSlug, "chats", channelSlug);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const sanitized = fileName.replace(/[^a-zA-Z0-9.\-_ ]/g, "_");

  // Keep original name; append _1, _2 etc. only if a duplicate exists in this folder
  const extIdx = sanitized.lastIndexOf(".");
  const baseName = extIdx > 0 ? sanitized.slice(0, extIdx) : sanitized;
  const ext = extIdx > 0 ? sanitized.slice(extIdx) : "";
  let savedName = sanitized;
  let counter = 1;
  while (existsSync(join(localDir, savedName))) {
    savedName = `${baseName}_${counter}${ext}`;
    counter++;
  }

  // Upload to OneDrive (falls back to local disk)
  // OneDrive path: Audits/{auditTitle}/Chat/{savedName}  → becomes /AuditTool/Audits/{auditTitle}/Chat/{savedName}
  const relativePath = `Audits/${auditTitle}/Chat/${savedName}`;
  const apiUrlPath = `/api/uploads/${auditSlug}/chats/${channelSlug}/${encodeURIComponent(savedName)}`;

  const uploadResult = await uploadFile(buffer, relativePath, localDir, savedName, apiUrlPath);
  const fileUrl = uploadResult.url;

  const message = await db.chatMessage.create({
    data: {
      auditId,
      auditName: privilege.auditTitle,
      channel,
      authorId: user.id,
      authorName: user.name ?? user.email ?? "Unknown",
      authorImage: null, // resolved live from User table on read
      authorRole,
      text: caption,
      fileUrl,
      fileName,
      fileMime: file.type || null,
      fileSize: file.size,
    },
  });

  // Notify audit assignees + admins about the file upload
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

    if (allIds.length > 0) {
      const authorName = user.name ?? user.email ?? "Unknown";
      const auditTitle = privilege.auditTitle || "Audit";

      await createNotifications(
        allIds.map((userId) => ({
          userId,
          type: "CHAT_MESSAGE" as const,
          title: `New file in ${auditTitle}`,
          message: `${authorName} shared: ${fileName}`,
          linkAdmin: `/adminDashboard/audits/${auditId}/chats?channel=${encodeURIComponent(channel)}`,
          linkUser: `/userDashboard/audits/${auditId}/chats?channel=${encodeURIComponent(channel)}`,
        })),
      );
    }
  } catch {
    // Never let notification crash the upload response
  }

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
      fileUrl: message.fileUrl
        ? message.fileUrl.startsWith("onedrive:/AuditTool/")
          ? `/api/uploads/${message.fileUrl.replace("onedrive:/AuditTool/", "")}`
          : message.fileUrl
        : undefined,
      fileName: message.fileName ?? undefined,
      fileMime: message.fileMime ?? undefined,
      fileSize: message.fileSize ?? undefined,
    },
  });
}
