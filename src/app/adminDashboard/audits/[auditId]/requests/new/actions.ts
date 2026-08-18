"use server";

import { db } from "~/server/db";
import { requireUser } from "~/server/helpers/currentUser";
import { logActivity } from "~/server/helpers/logActivity";
import { Prisma } from "generated/prisma";
import { emitAuditEvent, emitGlobalEvent } from "~/server/lib/event-bus";
import { syncNewRequestToPlanner } from "~/server/lib/planner";

type State = { ok: true; redirectTo: string } | { ok: false; error: string };

export type CreateRequestInput = {
  auditId: string;
  title: string;
  isFormal: string;
  returnTab: string;
  frIndex: string;
  labels: string[];
  estimatedDeliveryDate?: string;
};

export async function createRequest(_: State, input: FormData | CreateRequestInput): Promise<State> {
  let auditId: string, title: string, isFormal: boolean, returnTab: string, frIndex: string, labelValues: string[];

  let estimatedDeliveryDate: Date | null;

  if (input instanceof FormData) {
    auditId = String(input.get("auditId") || "");
    title = String(input.get("title") || "").trim();
    isFormal = String(input.get("isFormal") || "false") === "true";
    returnTab = String(input.get("returnTab") || "requests");
    frIndex = String(input.get("frIndex") || "").trim();
    labelValues = input.getAll("labels").map(String).filter(Boolean);
    const eddRaw = String(input.get("estimatedDeliveryDate") || "");
    estimatedDeliveryDate = eddRaw ? new Date(eddRaw) : null;
  } else {
    auditId = input.auditId || "";
    title = (input.title || "").trim();
    isFormal = (input.isFormal || "false") === "true";
    returnTab = input.returnTab || "requests";
    frIndex = (input.frIndex || "").trim();
    labelValues = input.labels || [];
    estimatedDeliveryDate = input.estimatedDeliveryDate ? new Date(input.estimatedDeliveryDate) : null;
  }

  if (!auditId) return { ok: false, error: "Missing auditId." };
  if (!title) return { ok: false, error: "Title is required." };

  const labels: string[] = [
    ...(frIndex ? [`FR${frIndex}`] : []),
    ...labelValues,
  ];

  const currentUser = await requireUser();

  const [audit, firstCol] = await Promise.all([
    db.audit.findUnique({ where: { id: auditId }, select: { title: true, roomRolesJson: true } }),
    db.requestStatus.findFirst({
      where: { auditId },
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!firstCol) return { ok: false, error: "No request statuses found for this audit." };

  let trackNumber = "";
  let requestId = "";
  try {
    await db.$transaction(async (tx) => {
      const counterKey = isFormal ? `formalNext:${auditId}` : `informalNext:${auditId}`;
      const counterRow = await tx.appConfig.findUnique({ where: { key: counterKey } });
      const seq = Number(counterRow?.value ?? "1");
      await tx.appConfig.upsert({
        where: { key: counterKey },
        create: { key: counterKey, value: String(seq + 1) },
        update: { value: String(seq + 1) },
      });
      const seqStr = String(seq).padStart(4, "0");
      const frPart = frIndex ? `–FR${frIndex}` : "";
      trackNumber = isFormal
        ? `${seqStr}${frPart}–${title}`
        : `INF${seqStr}${frPart}–${title}`;
      const created = await tx.request.create({
        data: {
          auditId,
          title,
          isFormal,
          requestStatusId: firstCol.id,
          statusName: firstCol.name,
          auditTitle: audit?.title ?? "",
          labels: JSON.stringify(labels),
          createdById: currentUser.id,
          createdByName: currentUser.name ?? currentUser.email ?? "",
          trackNumber,
          estimatedDeliveryDate,
        },
        select: { id: true },
      });
      requestId = created.id;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: `A request with the title "${title}" already exists in this audit${frIndex ? ` for FR${frIndex}` : ""}. Please use a different title.` };
    }
    throw err;
  }

  await syncNewRequestToPlanner({
    id: requestId,
    trackNumber,
    title,
    auditTitle: audit?.title ?? "",
    labels: JSON.stringify(labels),
    isFormal,
    estimatedDeliveryDate,
  });

  // Notify all assignees of this audit about the new request
  const auditAssignees = await db.auditAssignee.findMany({
    where: { auditId },
    select: { userId: true },
  });
  const notifyIds = auditAssignees.map(a => a.userId).filter(id => id !== currentUser.id);

  await logActivity({
    type: "REQUEST_CREATED",
    actorName: currentUser.name ?? currentUser.email ?? "User",
    targetId: auditId,
    targetTitle: title,
    meta: {
      auditTitle: audit?.title ?? "",
      isFormal: String(isFormal),
      trackNumber,
      status: firstCol.name,
      labels: labels.join(", "),
    },
    notifyUserIds: notifyIds,
  });

  emitAuditEvent(auditId, "requests");
  emitAuditTabCounts(auditId, await getAuditTabCounts(auditId));
  emitAuditEvent(auditId, "kanban");
  emitGlobalEvent("audits");

  const isAdminLike = currentUser.role === "ADMIN" || currentUser.role === "AUDIT_OWNER";
  const dashBase = isAdminLike ? "adminDashboard" : "userDashboard";
  const allowedTabs = new Set(["requests", "kanbanBoard", "chats", "assignees", "home"]);
  const safeTab = allowedTabs.has(returnTab) ? returnTab : "kanbanBoard";
  const tabSegment = safeTab === "home" ? "" : `/${safeTab}`;
  return { ok: true, redirectTo: `/${dashBase}/audits/${auditId}${tabSegment}` };
}
