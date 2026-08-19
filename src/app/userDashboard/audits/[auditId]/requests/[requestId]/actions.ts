"use server";

import { db } from "~/server/db";
import { revalidatePath } from "next/cache";
import { requireUser } from "~/server/helpers/currentUser";
import { logActivity } from "~/server/helpers/logActivity";
import { computeClosedAt } from "~/server/lib/requestStatus";
import { getUserPhoto, sendMailViaGraph } from "~/server/lib/graphClient";
import { syncRequestBucketToPlanner, syncRequestCategoriesToPlanner, syncRequestDueDateToPlanner } from "~/server/lib/planner";
import { env } from "~/env";

type State = { ok: true } | { ok: false; error: string };

export type UpdateRequestBasicInput = {
  auditId: string;
  requestId: string;
  title: string;
  isFormal: string;
  statusColumnId: string;
  frLabel: string;
  labels: string[];
  estimatedDeliveryDate?: string;
};

export type UpdateRequestAssigneesInput = {
  auditId: string;
  requestId: string;
  assigneeIds: string[];
  userMeta?: Record<string, { name?: string; email?: string }>;
};

function withUpdatedTrackTitle(currentTrackNumber: string | null, title: string): string {
  if (!currentTrackNumber) return title;
  const sepEnDash = currentTrackNumber.lastIndexOf("–");
  const sepDash = currentTrackNumber.lastIndexOf("-");
  const sep = Math.max(sepEnDash, sepDash);
  if (sep < 0) return title;
  return `${currentTrackNumber.slice(0, sep + 1)}${title}`;
}

function resolveAppBaseUrl(): string {
  return (env.AUTH_URL ?? env.NEXTAUTH_URL ?? "http://localhost:3002").replace(/\/$/, "");
}

export async function updateRequestBasic(_: State, input: FormData | UpdateRequestBasicInput): Promise<State> {
  let auditId: string, requestId: string, title: string, isFormal: boolean, statusColumnId: string, frLabel: string, labelValues: string[];
  let estimatedDeliveryDate: Date | null | undefined;

  if (input instanceof FormData) {
    auditId = String(input.get("auditId") || "");
    requestId = String(input.get("requestId") || "");
    title = String(input.get("title") || "").trim();
    isFormal = String(input.get("isFormal") || "false") === "true";
    statusColumnId = String(input.get("statusColumnId") || "");
    frLabel = String(input.get("frLabel") || "").trim();
    labelValues = input.getAll("labels").map(String).filter(Boolean);
    const eddRaw = String(input.get("estimatedDeliveryDate") || "");
    estimatedDeliveryDate = eddRaw ? new Date(eddRaw) : null;
  } else {
    auditId = input.auditId || "";
    requestId = input.requestId || "";
    title = (input.title || "").trim();
    isFormal = (input.isFormal || "false") === "true";
    statusColumnId = input.statusColumnId || "";
    frLabel = (input.frLabel || "").trim();
    labelValues = input.labels || [];
    estimatedDeliveryDate = input.estimatedDeliveryDate !== undefined
      ? (input.estimatedDeliveryDate ? new Date(input.estimatedDeliveryDate) : null)
      : undefined;
  }

  const labels: string[] = [
    ...(frLabel ? [frLabel] : []),
    ...labelValues,
  ];

  if (!auditId || !requestId) return { ok: false, error: "Missing ids." };
  if (!title) return { ok: false, error: "Title is required." };
  if (!statusColumnId) return { ok: false, error: "Status is required." };

  const requestStatus = await db.requestStatus.findUnique({
    where: { id: statusColumnId },
    select: { name: true },
  });

  if (!requestStatus) return { ok: false, error: "Invalid status selected." };

  const [existing, audit] = await Promise.all([
    db.request.findUnique({ where: { id: requestId }, select: { trackNumber: true, statusName: true, closedAt: true } }),
    db.audit.findUnique({ where: { id: auditId }, select: { title: true } }),
  ]);

  const updatedTrackNumber = withUpdatedTrackTitle(existing?.trackNumber ?? null, title);

  const closedAt = computeClosedAt({
    fromStatusName: existing?.statusName,
    toStatusName: requestStatus.name,
    currentClosedAt: existing?.closedAt ?? null,
  });

  await db.request.update({
    where: { id: requestId },
    data: {
      title,
      trackNumber: updatedTrackNumber,
      isFormal,
      requestStatusId: statusColumnId,
      statusName: requestStatus.name,
      labels: JSON.stringify(labels),
      closedAt,
      ...(estimatedDeliveryDate !== undefined ? { estimatedDeliveryDate } : {}),
    },
  });

  await db.requestAssignee.updateMany({
    where: { requestId },
    data: { requestTitle: title },
  });

  const currentUser = await requireUser();

  // Notify assignees of this request about the update
  const requestAssignees = await db.requestAssignee.findMany({
    where: { requestId },
    select: { userId: true },
  });
  const notifyIds = requestAssignees.map(a => a.userId).filter(id => id !== currentUser.id);

  await logActivity({
    type: "REQUEST_UPDATED",
    actorName: currentUser.name ?? currentUser.email ?? "User",
    targetId: requestId,
    targetTitle: existing?.trackNumber ?? title,
    meta: {
      auditId,
      auditTitle: audit?.title ?? "",
      status: requestStatus.name,
    },
    notifyUserIds: notifyIds,
  });

  void syncRequestBucketToPlanner(requestId, requestStatus.name);
  void syncRequestCategoriesToPlanner(requestId, labels, isFormal);
  void syncRequestDueDateToPlanner(requestId, estimatedDeliveryDate ?? null);
  revalidatePath(`/userDashboard/audits/${auditId}`);
  revalidatePath(`/userDashboard/audits/${auditId}/kanbanBoard`);
  revalidatePath(`/userDashboard/audits/${auditId}/requests`);
  revalidatePath(`/userDashboard/audits/${auditId}/requests/${requestId}`);
  return { ok: true };
}

export async function updateRequestAssignees(_: State, input: FormData | UpdateRequestAssigneesInput): Promise<State> {
  let auditId: string, requestId: string, selected: string[];
  let userMeta: Record<string, { name?: string; email?: string }> = {};

  if (input instanceof FormData) {
    auditId = String(input.get("auditId") || "");
    requestId = String(input.get("requestId") || "");
    selected = input.getAll("assigneeIds").map(String);
  } else {
    auditId = input.auditId || "";
    requestId = input.requestId || "";
    selected = input.assigneeIds || [];
    userMeta = input.userMeta ?? {};
  }

  if (!auditId || !requestId) return { ok: false, error: "Missing ids." };

  const [oldAssignees, req] = await Promise.all([
    db.requestAssignee.findMany({ where: { requestId }, select: { userId: true } }),
    db.request.findUnique({
      where: { id: requestId },
      select: {
        trackNumber: true,
        title: true,
        auditTitle: true,
        audit: { select: { title: true } },
      },
    }),
  ]);
  const oldIds = oldAssignees.map(a => a.userId);
  const addedIds = selected.filter(id => !oldIds.includes(id));
  const removedIds = oldIds.filter(id => !selected.includes(id));

  // Prefer the joined audit title over the potentially-empty denormalized field
  const resolvedAuditName = req?.audit?.title || req?.auditTitle || auditId;

  // Upsert any AD users not yet in the DB
  if (selected.length && Object.keys(userMeta).length > 0) {
    const existingUsers = await db.user.findMany({ where: { id: { in: selected } }, select: { id: true } });
    const existingIds = new Set(existingUsers.map((u) => u.id));
    for (const userId of selected) {
      if (!existingIds.has(userId)) {
        const meta = userMeta[userId];
        if (meta) {
          await db.user.create({
            data: {
              id: userId,
              email: meta.email ?? `${userId}@ad.unknown`,
              name: meta.name ?? userId,
              role: "USER",
            },
          });
          // Fire-and-forget: fetch photo from Graph and store it
          void getUserPhoto(userId).then((image) => {
            if (image) return db.user.update({ where: { id: userId }, data: { image } });
          }).catch(() => {});
        }
      } else {
        // Back-fill missing photo for existing stub users
        void db.user.findUnique({ where: { id: userId }, select: { image: true } }).then((u) => {
          if (!u?.image) {
            return getUserPhoto(userId).then((image) => {
              if (image) return db.user.update({ where: { id: userId }, data: { image } });
            });
          }
        }).catch(() => {});
      }
    }
  }

  // Fetch display names for all selected users
  const selectedUsers = selected.length
    ? await db.user.findMany({ where: { id: { in: selected } }, select: { id: true, name: true, email: true } })
    : [];
  const userNameMap = new Map(selectedUsers.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  await db.requestAssignee.deleteMany({ where: { requestId } });
  if (selected.length) {
    await db.requestAssignee.createMany({
      data: selected.map((userId) => ({
        requestId,
        userId,
        requestTitle: req?.title ?? "",
        auditName: resolvedAuditName,
        assigneeName: userNameMap.get(userId) ?? userMeta[userId]?.name ?? "",
      })),
    });
  }

  const currentUser = await requireUser();
  const targetTitle = req?.trackNumber ?? req?.title ?? requestId;
  const auditTitle = resolvedAuditName;

  if (addedIds.length > 0) {
    const addedUsers = await db.user.findMany({ where: { id: { in: addedIds } }, select: { name: true, email: true } });
    const assigneeNames = addedUsers.map((u: { name: string | null; email: string | null }) => u.name ?? u.email ?? "Unknown").join(", ");
    await logActivity({
      type: "USER_ASSIGNED_REQUEST",
      actorName: currentUser.name ?? currentUser.email ?? "User",
      targetId: requestId,
      targetTitle,
      meta: { auditId, auditTitle, assignedCount: String(addedIds.length), assigneeNames },
      notifyUserIds: addedIds.filter(id => id !== currentUser.id),
    });

    const creatorName = currentUser.name ?? currentUser.email ?? "A user";
    const requestLabel = targetTitle;
    const baseUrl = resolveAppBaseUrl();
    const nextPath = `/open-request?auditId=${encodeURIComponent(auditId)}&requestId=${encodeURIComponent(requestId)}`;
    const requestUrl = `${baseUrl}/login?next=${encodeURIComponent(nextPath)}`;

    for (const user of addedUsers) {
      const recipient = user.email?.trim();
      if (!recipient || !recipient.includes("@")) continue;

      const safeName = user.name ?? recipient;
      const subject = `You were assigned to request ${requestLabel}`;
      const html = [
        `<p>Hello ${safeName},</p>`,
        `<p>${creatorName} assigned you to a request in <strong>${auditTitle}</strong>.</p>`,
        `<p><strong>Request:</strong> ${requestLabel}</p>`,
        `<p><a href="${requestUrl}">Open request</a></p>`,
        `<p style="color:#64748b">This is an automated message from Audit Management Tool.</p>`,
      ].join("");

      void sendMailViaGraph({
        to: recipient,
        subject,
        html,
      });
    }
  }

  if (removedIds.length > 0) {
    const removedUsers = await db.user.findMany({ where: { id: { in: removedIds } }, select: { name: true, email: true } });
    const assigneeNames = removedUsers.map((u: { name: string | null; email: string | null }) => u.name ?? u.email ?? "Unknown").join(", ");
    await logActivity({
      type: "USER_UNASSIGNED_REQUEST",
      actorName: currentUser.name ?? currentUser.email ?? "User",
      targetId: requestId,
      targetTitle,
      meta: { auditId, auditTitle, assignedCount: String(removedIds.length), assigneeNames },
      notifyUserIds: removedIds,
    });
  }

  revalidatePath(`/userDashboard/audits/${auditId}/kanbanBoard`);
  revalidatePath(`/userDashboard/audits/${auditId}/requests`);
  revalidatePath(`/userDashboard/audits/${auditId}/requests/${requestId}`);
  return { ok: true };
}
