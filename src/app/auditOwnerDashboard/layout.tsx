import { redirect } from "next/navigation";
import { requireAuditOwner } from "@/server/helpers/currentUser";
import { db } from "~/server/db";
import AuditOwnerShell from "./_components/AuditOwnerShell";

export default async function AuditOwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireAuditOwner();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Audit owner access required") redirect("/userDashboard");
    redirect("/login");
  }

  const [logoConfig, ownedAudits] = await Promise.all([
    db.appConfig.findUnique({ where: { key: "appLogo" } }),
    db.audit.findMany({
      where: { createdById: user.id },
      select: { id: true },
    }),
  ]);

  const ownedAuditIds = ownedAudits.map((a) => a.id);

  return (
    <AuditOwnerShell
      user={{
        name: user.name ?? user.email ?? "Audit Owner",
        email: user.email ?? undefined,
        role: user.role,
        image: user.image ?? undefined,
      }}
      appLogo={logoConfig?.value ?? null}
      ownedAuditIds={ownedAuditIds}
    >
      {children}
    </AuditOwnerShell>
  );
}
