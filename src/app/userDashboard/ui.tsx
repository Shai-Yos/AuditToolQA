"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuditCard as SharedAuditCard } from "@/components/audit-card";

type DashboardUser = { name: string; role: string; image?: string };

type AssignedAudit = {
  id: string;
  trackId?: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  timezone?: string;
  roomsCount: number;
  usersCount: number;
  requestsCount: number;
  createdByName?: string;
  isAssigned: boolean;
  assignees: { name: string; image?: string | null }[];
};

export default function UserDashboardClient({
  user,
  audits,
}: {
  user: DashboardUser;
  audits: AssignedAudit[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<"all" | "assigned">("all");

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => { if (e.data === "audits") router.refresh(); };
    const onVisible = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { es.close(); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audits.filter((a) => {
      if (filter === "assigned" && !a.isAssigned) return false;
      return !q || a.title.toLowerCase().includes(q);
    });
  }, [audits, query, filter]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      {/* Subtle header gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />

      <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            User Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Welcome back,{" "}
            <span className="font-semibold text-slate-900">{user.name}</span>
            {" "}
            <span className="ml-1 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              User
            </span>
          </p>
        </div>

        {/* Search & filter controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              🔍
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search audits by title..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Assignment filter */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  filter === "all"
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-500 hover:bg-white hover:text-slate-700"
                }`}
                type="button"
              >
                All Active
              </button>
              <button
                onClick={() => setFilter("assigned")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  filter === "assigned"
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-500 hover:bg-white hover:text-slate-700"
                }`}
                type="button"
              >
                Assigned Audits
              </button>
            </div>
            {/* View toggle */}
            <div className="ml-0 flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:ml-2">
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

        {/* Results count */}
        <div className="mt-4 text-sm text-slate-600">
          Showing{" "}
          <span className="font-semibold text-slate-900">{filtered.length}</span>{" "}
          {filter === "assigned" ? "assigned" : "active"} audits
          {query && (
            <>
              {" "}matching{" "}
              <span className="font-semibold text-slate-900">&ldquo;{query}&rdquo;</span>
            </>
          )}
        </div>

        {/* Cards */}
        <div
          className={
            viewMode === "grid"
              ? "mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
              : "mt-6 flex flex-col gap-4"
          }
        >
          {filtered.map((a) => (
            <SharedAuditCard
              key={a.id}
              audit={a}
              dashboardBase="/userDashboard"
              viewMode={viewMode}
            />
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center shadow-sm">
              <div className="mb-3 text-6xl">🔎</div>
              <div className="text-xl font-semibold text-slate-900">
                No audits found
              </div>
              <div className="mt-2 max-w-md text-sm text-slate-600">
                {filter === "assigned" && !query
                  ? "You are not assigned to any active audits yet."
                  : "Try adjusting your search or filter."}
              </div>
              {(query || filter !== "assigned") && (
                <button
                  onClick={() => { setQuery(""); setFilter("all"); }}
                  className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
                  type="button"
                >
                  Reset filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
