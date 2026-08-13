import { db } from "@/server/db";
import { requireAdmin } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import UsersClient from "./ui";

export default async function UsersPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      isActive: true,
      createdAt: true,
      auditsAssigned: { select: { id: true } },
    },
  });

  // Photos are populated at sign-in (auth.ts) or when a member is added via
  // the Azure AD search modal (searchDbUsers). We intentionally do NOT call
  // Microsoft Graph here for the whole table — users with no cached image yet
  // (e.g. never signed in) just show initials until their next sign-in.
  const mapped = users.map((u) => ({
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role,
    image: u.image || null,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    assignedAudits: u.auditsAssigned.length,
  }));

  return <UsersClient users={mapped} />;
}
