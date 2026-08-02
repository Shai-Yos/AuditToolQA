import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/helpers/currentUser";
import { db } from "~/server/db";
import AdminShell from "./_components/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Admin access required") redirect("/userDashboard");
    redirect("/login");
  }

  const logoConfig = await db.appConfig.findUnique({ where: { key: "appLogo" } });
  const pendingAccessRequests = await db.accessRequest.count({ where: { status: "PENDING" } });

  return (
    <AdminShell
      user={{
        name: user.name ?? user.email ?? "Admin",
        email: user.email ?? undefined,
        role: user.role,
        image: user.image ?? undefined,
      }}
      appLogo={logoConfig?.value ?? null}
      pendingAccessRequests={pendingAccessRequests}
    >
      {children}
    </AdminShell>
  );
}
