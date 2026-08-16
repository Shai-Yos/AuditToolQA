import { redirect } from "next/navigation";
import { requireUser } from "@/server/helpers/currentUser";
import { hasRegulatoryImplementationAccess } from "@/server/lib/regulatoryImplementationAccess";
import { db } from "~/server/db";
import UserShell from "./_components/UserShell";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const [logoConfig, canAccessRegulatoryImplementation] = await Promise.all([
    db.appConfig.findUnique({ where: { key: "appLogo" } }),
    hasRegulatoryImplementationAccess(user.id),
  ]);

  return (
    <UserShell
      user={{
        name: user.name ?? user.email ?? "User",
        email: user.email ?? undefined,
        role: user.role,
        image: user.image ?? undefined,
      }}
      appLogo={logoConfig?.value ?? null}
      canAccessRegulatoryImplementation={canAccessRegulatoryImplementation}
    >
      {children}
    </UserShell>
  );
}
