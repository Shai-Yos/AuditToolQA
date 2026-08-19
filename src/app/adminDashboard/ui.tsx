"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelAudit } from "./actions";
import { AuditCard as SharedAuditCard } from "@/components/audit-card";

type DashboardUser = {
  name: string;
  role: "ADMIN" | "USER" | string;
  image?: string;
};

type AuditCardVM = {
  id: string;
  trackId?: string;
  title: string;
  status: "Draft" | "Active" | "Completed" | "Archived";
  startDate: string;
  endDate?: string | null;
  timezone?: string;
  roomsCount: number;
  usersCount: number;
  requestsCount: number;
  createdByName?: string;
  isAssigned: boolean;
  isMyAudit: boolean;
  assignees: { name: string; image?: string | null }[];
};

type ActivityItem = {
  id: string;
  action: string;
  actorName: string;
  targetId: string;
  targetTitle: string;
  meta: string | null;
  createdAt: string;
};

export default function AdminDashboardClient({
  user,
  stats,
  audits,
  recentActivity,
}: {
  user: DashboardUser;
  stats: {
    totalAudits: number;
    activeAudits: number;
    totalRequests: number;
  };
  audits: AuditCardVM[];
  recentActivity: ActivityItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [auditFilter, setAuditFilter] = useState<"all" | "myAudits" | "assignedToMe">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return audits.filter((a) => {
      if (auditFilter === "myAudits" && !a.isMyAudit) return false;
      if (auditFilter === "assignedToMe" && !a.isAssigned) return false;
      return !q || a.title.toLowerCase().includes(q);
    });
  }, [audits, query, auditFilter]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />

      <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Admin Dashboard
            </h1>

            <p className="mt-1.5 text-sm text-slate-600">
              Welcome back,{" "}
              <span className="font-semibold text-slate-900">{user.name}</span>{" "}
              <span
                className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700"
              >
                Admin
              </span>
            </p>
          </div>

          <Link
            href="/adminDashboard/createAudit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            <span className="text-lg leading-none">+</span>
            Create New Audit
          </Link>
        </div>

        <div className="mx-auto mb-8 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href="/adminDashboard/allAudits" className="block">
            <StatCard
              title="Total Audits"
              value={stats.totalAudits}
              icon="📊"
              className="cursor-pointer bg-white hover:ring-2 hover:ring-blue-200"
            />
          </Link>

          <Link
            href="#audits-section"
            className="block"
            onClick={(e) => {
              e.preventDefault();
              const target = document.getElementById("audits-section");
              if (!target) return;

              const start = window.scrollY;
              const end = target.getBoundingClientRect().top + window.scrollY - 24;
              const duration = 900;
              const startTime = performance.now();

              const ease = (t: number) =>
                t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

              const step = (now: number) => {
                const elapsed = Math.min((now - startTime) / duration, 1);
                window.scrollTo(0, start + (end - start) * ease(elapsed));
                if (elapsed < 1) requestAnimationFrame(step);
              };

              requestAnimationFrame(step);
            }}
          >
            <StatCard
              title="Active Audits"
              value={stats.activeAudits}
              icon="⚡"
              className="cursor-pointer bg-white hover:ring-2 hover:ring-blue-200"
            />
          </Link>

          <Link href="/adminDashboard/allRequests" className="block">
            <StatCard
              title="Total Requests"
              value={stats.totalRequests}
              icon="📝"
              className="cursor-pointer bg-white hover:ring-2 hover:ring-blue-200"
            />
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div id="audits-section" className="min-w-0 flex-1 scroll-mt-6">
            <div className="mb-4 flex flex-col gap-3">
              {/* Row 1: Search */}
              <div className="relative w-full">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  🔍
                </div>

                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search active audits..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              {/* Row 2: View all audits + filter/view buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/adminDashboard/allAudits"
                  className="pl-1 text-lg font-bold text-slate-700 transition-colors hover:text-blue-700 hover:underline"
                >
                  View all audits →
                </Link>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button
                      onClick={() => setAuditFilter("all")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        auditFilter === "all"
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:bg-white hover:text-slate-700"
                      }`}
                      type="button"
                    >
                      All Active
                    </button>

                    <button
                      onClick={() => setAuditFilter("myAudits")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        auditFilter === "myAudits"
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:bg-white hover:text-slate-700"
                      }`}
                      type="button"
                    >
                      My Audits
                    </button>

                    <button
                      onClick={() => setAuditFilter("assignedToMe")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        auditFilter === "assignedToMe"
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:bg-white hover:text-slate-700"
                      }`}
                      type="button"
                    >
                      Assigned to Me
                    </button>
                  </div>

                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        viewMode === "grid"
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:bg-white hover:text-slate-700"
                      }`}
                      type="button"
                      title="Grid view"
                    >
                      ⊞
                    </button>

                    <button
                      onClick={() => setViewMode("list")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        viewMode === "list"
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:bg-white hover:text-slate-700"
                      }`}
                      type="button"
                      title="List view"
                    >
                      ☰
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 gap-5 xl:grid-cols-2"
                  : "flex flex-col gap-4"
              }
            >
              {filtered.map((a) => (
                <SharedAuditCard
                  key={a.id}
                  audit={{ ...a, isOwner: a.isMyAudit }}
                  dashboardBase="/adminDashboard"
                  viewMode={viewMode}
                  canExport
                  canEdit={user.role === "ADMIN"}
                  canCancel
                  onCancel={() => cancelAudit(a.id)}
                />
              ))}

              {filtered.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center shadow-sm">
                  <div className="mb-3 text-6xl">🔎</div>

                  <div className="text-xl font-semibold text-slate-900">
                    No active audits found
                  </div>

                  <div className="mt-2 max-w-md text-sm text-slate-600">
                    {query
                      ? "No active audits match your search."
                      : "There are no active audits at the moment."}
                  </div>

                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
                      type="button"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="w-full shrink-0 lg:w-80 xl:w-96">
            {recentActivity.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Recent Activity
                  </p>
                  <ExportDropdown />
                </div>
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  No activity yet
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Recent Activity
                  </p>
                  <ExportDropdown />
                </div>
                <div className="max-h-[600px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
                  {recentActivity.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportDropdown() {
  const [open, setOpen] = useState(false);

  const options: { label: string; buildUrl: () => string }[] = [
    {
      label: "Today",
      buildUrl: () => {
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        return `/api/activity-log/export?preset=today&from=${from.toISOString()}`;
      },
    },
    {
      label: "This Week",
      buildUrl: () => {
        const from = new Date();
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);
        return `/api/activity-log/export?preset=week&from=${from.toISOString()}`;
      },
    },
    {
      label: "This Month",
      buildUrl: () => {
        const from = new Date();
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        return `/api/activity-log/export?preset=month&from=${from.toISOString()}`;
      },
    },
    {
      label: "All Time",
      buildUrl: () => `/api/activity-log/export?preset=alltime`,
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-green-300 hover:bg-slate-50 hover:text-green-700"
      >
        <span>📥</span> Export Excel <span className="ml-0.5 opacity-60">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

          <div className="absolute right-0 z-20 mt-1.5 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {options.map((opt) => (
              <a
                key={opt.label}
                href={opt.buildUrl()}
                download
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-green-700"
              >
                {opt.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  className,
}: {
  title: string;
  value: number;
  icon: string;
  className: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-slate-200 p-6 shadow-sm transition hover:shadow-md ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-600">{title}</div>

          <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            {value}
          </div>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-2xl ring-1 ring-slate-200">
          {icon}
        </div>
      </div>
    </div>
  );
}

const ACTIVITY_META: Record<
  string,
  {
    icon: string;
    color: string;
    label: (title: string, meta: Record<string, string>) => string;
    detail?: (title: string, meta: Record<string, string>) => string | null;
  }
> = {
  AUDIT_CREATED: {
    icon: "📋",
    color: "bg-green-50 text-green-700 ring-green-200",
    label: (t) => `Audit created: ${t}`,
    detail: (_, m) => {
      const fmt = (s: string) =>
        `${new Date(s).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })} UTC`;

      const startFmt = m.startAt ? fmt(m.startAt) : null;
      const endFmt = m.endAt ? fmt(m.endAt) : null;

      const dateStr = startFmt
        ? !endFmt || endFmt === startFmt
          ? startFmt
          : `${startFmt} → ${endFmt}`
        : null;

      return [m.status, dateStr].filter(Boolean).join(" · ") || null;
    },
  },

  AUDIT_UPDATED: {
    icon: "✏️",
    color: "bg-blue-50 text-blue-700 ring-blue-200",
    label: (t) => `Audit updated: ${t}`,
    detail: (_, m) => {
      const fmt = (s: string) =>
        `${new Date(s).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })} UTC`;

      const startFmt = m.startAt ? fmt(m.startAt) : null;
      const endFmt = m.endAt ? fmt(m.endAt) : null;

      const dateStr = startFmt
        ? !endFmt || endFmt === startFmt
          ? startFmt
          : `${startFmt} → ${endFmt}`
        : null;

      return [m.status, dateStr].filter(Boolean).join(" · ") || null;
    },
  },

  AUDIT_ARCHIVED: {
    icon: "📦",
    color: "bg-slate-100 text-slate-700 ring-slate-200",
    label: (t) => `Audit archived: ${t}`,
  },

  REQUEST_CREATED: {
    icon: "📝",
    color: "bg-slate-50 text-slate-700 ring-slate-200",
    label: (t, m) => `New request "${m.trackNumber || t}"`,
    detail: (_, m) => (m.auditTitle ? `Audit: ${m.auditTitle}` : null),
  },

  REQUEST_MOVED: {
    icon: "↔️",
    color: "bg-amber-50 text-amber-700 ring-amber-200",
    label: (t, m) =>
      m.fromStatus && m.toStatus
        ? `Request "${t}" moved from ${m.fromStatus} to ${m.toStatus}`
        : m.toStatus
          ? `"${t}" moved to ${m.toStatus}`
          : `Moved: ${t}`,
    detail: (_, m) => (m.auditTitle ? `Audit: ${m.auditTitle}` : null),
  },

  REQUEST_CANCELLED: {
    icon: "🚫",
    color: "bg-red-50 text-red-700 ring-red-200",
    label: (t, m) =>
      m.fromStatus
        ? `Request "${t}" cancelled (was ${m.fromStatus})`
        : `Request "${t}" cancelled`,
    detail: (_, m) => (m.auditTitle ? `Audit: ${m.auditTitle}` : null),
  },

  REQUEST_UPDATED: {
    icon: "✏️",
    color: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    label: (t) => `Request updated: ${t}`,
    detail: (_, m) => (m.auditTitle ? `Audit: ${m.auditTitle}` : null),
  },

  REQUEST_DELETED: {
    icon: "🗑️",
    color: "bg-red-50 text-red-700 ring-red-200",
    label: (t, m) => `Request "${m.trackNumber || t}" deleted`,
    detail: (_, m) => (m.auditTitle ? `Audit: ${m.auditTitle}` : null),
  },

  USER_ASSIGNED_REQUEST: {
    icon: "👤",
    color: "bg-purple-50 text-purple-700 ring-purple-200",
    label: (t) => `Assignees updated on request: ${t}`,
    detail: (_, m) =>
      [
        m.assigneeNames
          ? `Assigned: ${m.assigneeNames}`
          : m.assignedCount
            ? `${m.assignedCount} assignee(s)`
            : null,
        m.auditTitle ? `Audit: ${m.auditTitle}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
  },

  USER_UNASSIGNED_REQUEST: {
    icon: "🚫",
    color: "bg-orange-50 text-orange-700 ring-orange-200",
    label: (t) => `Assignees removed from request: ${t}`,
    detail: (_, m) =>
      [
        m.assigneeNames
          ? `Removed: ${m.assigneeNames}`
          : m.assignedCount
            ? `${m.assignedCount} assignee(s)`
            : null,
        m.auditTitle ? `Audit: ${m.auditTitle}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
  },

  USER_ASSIGNED_AUDIT: {
    icon: "👥",
    color: "bg-violet-50 text-violet-700 ring-violet-200",
    label: (t) => `Users assigned to audit: ${t}`,
    detail: (_, m) =>
      m.assigneeNames
        ? `Assigned: ${m.assigneeNames}`
        : m.assignedCount
          ? `${m.assignedCount} user(s)`
          : null,
  },

  USER_UNASSIGNED_AUDIT: {
    icon: "🚫",
    color: "bg-orange-50 text-orange-700 ring-orange-200",
    label: (t) => `Users removed from audit: ${t}`,
    detail: (_, m) =>
      m.assigneeNames
        ? `Removed: ${m.assigneeNames}`
        : m.assignedCount
          ? `${m.assignedCount} user(s)`
          : null,
  },

  USER_ROLE_UPDATED_AUDIT: {
    icon: "🔄",
    color: "bg-sky-50 text-sky-700 ring-sky-200",
    label: (t) => `User roles updated in audit: ${t}`,
    detail: (_, m) => m.changes || null,
  },

  ACCESS_REQUEST_SUBMITTED: {
    icon: "🔑",
    color: "bg-blue-50 text-blue-700 ring-blue-200",
    label: (t, m) =>
      `Access request submitted${m.requestedRole ? ` (${m.requestedRole})` : ""}: ${t}`,
    detail: (_, m) => (m.email ? m.email : null),
  },

  ACCESS_REQUEST_APPROVED: {
    icon: "✅",
    color: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    label: (t, m) =>
      `Access approved for ${t}${m.grantedRole ? ` as ${m.grantedRole}` : ""}`,
    detail: (_, m) => (m.email ? m.email : null),
  },

  ACCESS_REQUEST_REJECTED: {
    icon: "⛔",
    color: "bg-red-50 text-red-700 ring-red-200",
    label: (t) => `Access request rejected: ${t}`,
    detail: (_, m) => (m.email ? m.email : null),
  },
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const def = ACTIVITY_META[item.action] ?? {
    icon: "🔔",
    color: "bg-slate-50 text-slate-700 ring-slate-200",
    label: (t: string) => t,
  };

  const meta = item.meta ? (JSON.parse(item.meta) as Record<string, string>) : {};
  const label = def.label(item.targetTitle, meta);
  const detail = def.detail?.(item.targetTitle, meta) ?? null;

  const date = new Date(item.createdAt);
  const timeLabel = `${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;

  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ring-1 ${def.color}`}
      >
        {def.icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-slate-900">{label}</p>

        {detail && <p className="mt-0.5 break-words text-xs text-slate-500">{detail}</p>}

        <p className="mt-0.5 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{item.actorName}</span>
          {" · "}
          {timeLabel}
        </p>
      </div>
    </div>
  );
}