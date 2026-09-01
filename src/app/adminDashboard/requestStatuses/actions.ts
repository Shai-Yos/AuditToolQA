"use server";

import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { requireAdmin } from "~/server/helpers/currentUser";
import { validateMandatoryRequestStatuses } from "@/lib/request-status-rules";

export type StatusColumnDraft = {
  name: string;
  order: number;
  color: string;
};

export async function saveDefaultStatuses(statuses: StatusColumnDraft[]) {
  await requireAdmin();
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error("At least one status column is required.");
  }
  const validation = validateMandatoryRequestStatuses(statuses);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  await db.appConfig.upsert({
    where: { key: "defaultStatusColumns" },
    create: { key: "defaultStatusColumns", value: JSON.stringify(statuses) },
    update: { value: JSON.stringify(statuses) },
  });
  revalidatePath("/adminDashboard/requestStatuses");
  revalidatePath("/adminDashboard/createAudit");
}
