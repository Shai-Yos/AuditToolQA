"use server";

import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { requireAdmin } from "~/server/helpers/currentUser";

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
  await db.appConfig.upsert({
    where: { key: "defaultStatusColumns" },
    create: { key: "defaultStatusColumns", value: JSON.stringify(statuses) },
    update: { value: JSON.stringify(statuses) },
  });
  revalidatePath("/adminDashboard/requestStatuses");
  revalidatePath("/adminDashboard/createAudit");
}
