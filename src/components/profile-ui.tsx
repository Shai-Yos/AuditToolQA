"use client";

import { Avatar } from "@/components/shell-helpers";

const GUIDE_URLS: Record<string, string> = {
  ADMIN:
    "https://docs.philips.com/:p:/r/personal/ctami-automations_philips_com/Documents/AuditTool/Guides/Admins.pptx?d=w1b030350f1244274a06b078b83b309d4&csf=1&web=1&e=GHlDNc",
  AUDIT_OWNER:
    "https://docs.philips.com/:p:/r/personal/ctami-automations_philips_com/Documents/AuditTool/Guides/Audit%20Owners.pptx?d=w771dbb7816c2465dafe172902d8d17de&csf=1&web=1&e=vPaDJE",
  USER:
    "https://docs.philips.com/:p:/r/personal/ctami-automations_philips_com/Documents/AuditTool/Guides/Users.pptx?d=w6b978327327347d1a9c7d06d1570b1bc&csf=1&web=1&e=w9Cjz0",
};

export type ProfileUser = {
  name: string;
  email: string;
  role: string;
  image: string | null;
  memberSince: string;
};

export default function ProfileUI({ user }: { user: ProfileUser }) {
  const memberSince = new Date(user.memberSince).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const roleBadge =
    user.role === "ADMIN"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : user.role === "AUDIT_OWNER"
        ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  const roleLabel =
    user.role === "ADMIN" ? "Admin" : user.role === "AUDIT_OWNER" ? "Audit Owner" : "User";

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-transparent">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent dark:from-slate-800/40 dark:via-transparent" />

      <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Profile</h1>
          <p className="mt-1 text-sm text-slate-500">Your account details and role information</p>
        </div>

        {/* Profile card — horizontal */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-center">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-700 border border-slate-200">
              <Avatar name={user.name || user.email} src={user.image ?? undefined} textSize="text-xl" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
                <p className="text-2xl font-bold text-slate-900">{user.name || "—"}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${roleBadge}`}>
                  {roleLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{user.email}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-slate-100 pt-4 text-left sm:grid-cols-2 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Role</dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-800">{roleLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Member Since</dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-800">{memberSince}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Roles grid */}
        <div className="mt-8">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Application Roles</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <RoleCard
              role="Admin"
              accent="amber"
              description="Full control over the application."
              highlight={user.role === "ADMIN"}
              guideUrl={user.role === "ADMIN" ? GUIDE_URLS.ADMIN : undefined}
              capabilities={[
                "Create, edit, and manage audits (while not completed)",
                "Assign users to audits and configure their roles",
                "Configure FR / BR structures per audit",
                "View all audits, requests, chats, and transcriptions",
                "Manage request statuses globally",
                "Participate in every audit chat without being assigned",
              ]}
            />
            <RoleCard
              role="Audit Owner"
              accent="indigo"
              description="Standard access scoped to active audits they are assigned to, plus creates and manages their own audits."
              highlight={user.role === "AUDIT_OWNER"}
              guideUrl={user.role === "AUDIT_OWNER" ? GUIDE_URLS.AUDIT_OWNER : undefined}
              capabilities={[
                "View only active audits",
                "Participate in chats for assigned audits only",
                "Upload documents to requests",
                "Create requests only if assigned the QM role within an audit",
                "Create audits",
                "Full access to owned audits",
              ]}
            />
            <RoleCard
              role="User"
              accent="emerald"
              description="Standard access scoped to active audits they are assigned to."
              highlight={user.role === "USER"}
              guideUrl={user.role === "USER" ? GUIDE_URLS.USER : undefined}
              capabilities={[
                "View only active audits",
                "Participate in chats for assigned audits only",
                "Upload documents to requests",
                "Create requests only if assigned the QM role within an audit",
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  role,
  accent,
  description,
  capabilities,
  highlight,
  guideUrl,
}: {
  role: string;
  accent: "amber" | "indigo" | "emerald";
  description: string;
  capabilities: string[];
  highlight?: boolean;
  guideUrl?: string;
}) {
  const bar = { amber: "bg-amber-400", indigo: "bg-indigo-400", emerald: "bg-emerald-400" }[accent];
  const badge = {
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  }[accent];
  const dot = { amber: "bg-amber-400", indigo: "bg-indigo-400", emerald: "bg-emerald-400" }[accent];
  const highlightBorder = {
    amber: "border-amber-400 ring-amber-300",
    indigo: "border-indigo-400 ring-indigo-300",
    emerald: "border-emerald-400 ring-emerald-300",
  }[accent];
  const yourRoleBadge = {
    amber: "bg-amber-100 text-amber-700",
    indigo: "bg-indigo-100 text-indigo-700",
    emerald: "bg-emerald-100 text-emerald-700",
  }[accent];
  const guideColor = {
    amber: "text-amber-700",
    indigo: "text-indigo-700",
    emerald: "text-emerald-700",
  }[accent];

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${highlight ? `${highlightBorder} ring-1` : "border-slate-200"}`}>
      <div className={`h-1.5 ${bar}`} />
      <div className="p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badge}`}>{role}</span>
          {highlight && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${yourRoleBadge}`}>Your role</span>}
        </div>
        <p className="mb-4 text-sm text-slate-500 leading-relaxed">{description}</p>
        <ul className="space-y-2">
          {capabilities.map((cap) => (
            <li key={cap} className="flex items-start gap-2 text-sm text-slate-600">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              {cap}
            </li>
          ))}
        </ul>
        {guideUrl && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <a
              href={guideUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 text-xs font-bold transition hover:underline ${guideColor}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              View Guidance
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
