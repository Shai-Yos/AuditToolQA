import { db } from "@/server/db";
import { requireAdmin } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import { getUserPhoto } from "@/server/lib/graphClient";
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

  // Resolve photos for users we've never checked (image === null) in one batch,
  // server-side, so the client never has to fire a Graph request per row.
  // "" means already checked & confirmed no photo — never re-queried.
  const uncheckedIds = users.filter((u) => u.image === null).map((u) => u.id);
  const resolvedImages = new Map<string, string>();
  if (uncheckedIds.length > 0) {
    const results = await Promise.all(
      uncheckedIds.map(async (id) => [id, await getUserPhoto(id).catch(() => null)] as const)
    );
    for (const [id, photo] of results) resolvedImages.set(id, photo ?? "");
    await Promise.all(
      results.map(([id, photo]) =>
        db.user.update({ where: { id }, data: { image: photo ?? "" } }).catch(() => {})
      )
    );
  }

  const mapped = users.map((u) => ({
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role,
    image: u.image ?? resolvedImages.get(u.id) ?? null,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    assignedAudits: u.auditsAssigned.length,
  }));

  return <UsersClient users={mapped} />;
}
