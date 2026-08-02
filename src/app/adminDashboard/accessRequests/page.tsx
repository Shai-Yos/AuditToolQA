import { db } from "@/server/db";
import { requireAdmin } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import AccessRequestsClient from "./ui";

export default async function AccessRequestsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }

  const requests = await db.accessRequest.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      requestedRole: true,
      reason: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      reviewedByName: true,
      reviewNote: true,
    },
  });

  // Fetch avatars for any requesters that already have a User record
  const emails = [...new Set(requests.map((r) => r.email))];
  const users = emails.length
    ? await db.user.findMany({
        where: { email: { in: emails } },
        select: { email: true, image: true },
      })
    : [];
  const imageByEmail = new Map(users.map((u) => [u.email, u.image ?? null]));

  const mapped = requests.map((r) => ({
    ...r,
    image: imageByEmail.get(r.email) ?? null,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  }));

  return <AccessRequestsClient requests={mapped} />;
}
