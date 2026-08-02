import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import RoleUpgradeRequestUI from "@/components/role-upgrade-request-ui";

export default async function RequestRolePage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/adminDashboard");

  // Look at the MOST RECENT request (any status) so a later APPROVED
  // supersedes an older REJECTED and we don't show a stale rejection.
  const latest = await db.accessRequest.findFirst({
    where: { email: user.email ?? "" },
    orderBy: { createdAt: "desc" },
    select: { status: true, requestedRole: true, createdAt: true, reviewNote: true },
  });

  const existingRequest =
    latest && (latest.status === "PENDING" || latest.status === "REJECTED")
      ? latest
      : null;

  const serialized = existingRequest
    ? { ...existingRequest, createdAt: existingRequest.createdAt.toISOString() }
    : null;

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent dark:from-slate-800/40 dark:via-transparent" />
      <div className="relative mx-auto max-w-2xl px-4 pt-16 pb-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Request Role Upgrade
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Request a higher permission level. An admin will review and decide.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:bg-slate-800 dark:border-slate-700 p-6">
          <RoleUpgradeRequestUI
            currentRole={user.role}
            userEmail={user.email ?? ""}
            userName={user.name ?? user.email ?? ""}
            existingRequest={serialized}
          />
        </div>
      </div>
    </div>
  );
}
