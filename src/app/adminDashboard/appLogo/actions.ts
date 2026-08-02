"use server";

import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "~/server/db";
import { requireAdmin } from "~/server/helpers/currentUser";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function uploadAppLogo(formData: FormData) {
  await requireAdmin();

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    throw new Error("No file provided.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Invalid file type. Only PNG, JPEG, GIF, WebP, SVG and ICO are allowed.");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("File too large. Maximum size is 2 MB.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const sanitizedExt = ext.replace(/[^a-z0-9]/g, "");
  const fileName = `app-logo-${Date.now()}.${sanitizedExt}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "app-logo");

  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, fileName), buffer);

  const logoUrl = `/api/uploads/app-logo/${fileName}`;

  await db.appConfig.upsert({
    where: { key: "appLogo" },
    create: { key: "appLogo", value: logoUrl },
    update: { value: logoUrl },
  });

  revalidatePath("/", "layout");
  revalidatePath("/adminDashboard", "layout");
  revalidatePath("/userDashboard", "layout");

  return { url: logoUrl };
}

export async function removeAppLogo() {
  await requireAdmin();

  await db.appConfig.deleteMany({ where: { key: "appLogo" } });

  revalidatePath("/", "layout");
  revalidatePath("/adminDashboard", "layout");
  revalidatePath("/userDashboard", "layout");
}
