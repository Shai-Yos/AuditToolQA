"use server";

import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { requireAdmin } from "~/server/helpers/currentUser";

export async function saveDefaultRequestLabels(labels: string[]) {
  await requireAdmin();
  if (!Array.isArray(labels)) {
    throw new Error("Invalid labels payload.");
  }

  const cleaned = labels
    .map((label) => String(label ?? "").trim())
    .filter((label) => label.length > 0);

  if (cleaned.length === 0) {
    throw new Error("At least one label is required.");
  }

  await db.appConfig.upsert({
    where: { key: "defaultRequestLabels" },
    create: { key: "defaultRequestLabels", value: JSON.stringify(cleaned) },
    update: { value: JSON.stringify(cleaned) },
  });

  revalidatePath("/adminDashboard/requestLabels");
}
