import { redirect } from "next/navigation";
import { requireUser } from "@/server/helpers/currentUser";
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

  const logoConfig = await db.appConfig.findUnique({ where: { key: "appLogo" } });

  return (
    <UserShell
      user={{
        name: user.name ?? user.email ?? "User",
        email: user.email ?? undefined,
        role: user.role,
        image: user.image ?? undefined,
      }}
      appLogo={logoConfig?.value ?? null}
    >
      {children}
    </UserShell>
  );
}
