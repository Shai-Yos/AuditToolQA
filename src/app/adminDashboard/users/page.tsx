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

  const mapped = users.map((u) => ({
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role,
    image: u.image ?? null,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    assignedAudits: u.auditsAssigned.length,
  }));

  return <UsersClient users={mapped} />;
}
