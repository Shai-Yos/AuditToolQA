"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelAudit } from "../actions";
import { AuditCard as SharedAuditCard } from "@/components/audit-card";

type AuditCardVM = {
  id: string;
  trackId?: string;
  title: string;
  status: "Draft" | "Active" | "Completed" | "Archived";
  startDate: string;
  endDate?: string | null;
  roomsCount: number;
  usersCount: number;
  requestsCount: number;
  createdByName?: string;
  isAssigned: boolean;
  isOwned: boolean;
  assignees: { name: string; image?: string | null }[];
};

export default function AllAuditsOwnerClient({ audits }: { audits: AuditCardVM[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [auditFilter, setAuditFilter] = useState<"all" | "myAudits" | "assignedToMe">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audits.filter((a) => {
      if (auditFilter === "myAudits" && !a.isOwned) return false;
      if (auditFilter === "assignedToMe" && !a.isAssigned) return false;
      const matchQuery = !q || a.title.toLowerCase().includes(q);
      const matchFilter = statusFilter.length === 0 || statusFilter.includes(a.status);
      return matchQuery && matchFilter;
    });
  }, [audits, query, statusFilter, auditFilter]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />

      <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              All Audits
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Browse and filter all audits. You can edit audits you created.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            ← Back
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:flex-1">
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

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                  All Audits
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

              <StatusFilterDropdown selected={statusFilter} onChange={setStatusFilter} />
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

        {/* Results count */}
        <div className="mt-4 text-sm text-slate-600">
          Showing{" "}
          <span className="font-semibold text-slate-900">{filtered.length}</span> of{" "}
          <span className="font-semibold text-slate-900">{audits.length}</span> audits
        </div>

        {/* Audit grid / list */}
        <div className="mt-6">
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-3"
                : "flex flex-col gap-4"
            }
          >
            {filtered.map((a) => (
              <SharedAuditCard
                key={a.id}
                audit={{ ...a, isOwner: a.isOwned }}
                dashboardBase="/auditOwnerDashboard"
                viewMode={viewMode}
                canExport
                canEdit={a.isOwned}
                canCancel={a.isOwned && a.status !== "Archived"}
                onCancel={() => cancelAudit(a.id)}
              />
            ))}

            {filtered.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center shadow-sm">
                <div className="mb-3 text-6xl">🔎</div>
                <div className="text-xl font-semibold text-slate-900">No audits found</div>
                <div className="mt-2 max-w-md text-sm text-slate-600">
                  {query
                    ? "Try adjusting your search or filter criteria."
                    : "No audits match the selected filter."}
                </div>
                {(query || statusFilter.length > 0 || auditFilter !== "all") && (
                  <button
                    onClick={() => { setQuery(""); setStatusFilter([]); setAuditFilter("all"); }}
                    className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
                    type="button"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusFilterDropdown({ selected, onChange }: { selected: string[]; onChange: (val: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const statuses = ["Active", "Draft", "Completed", "Archived"] as const;
  const toggle = (s: string) =>
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  const label =
    selected.length === 0 ? "All Statuses" :
    selected.length === 1 ? selected[0]! :
    `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-4 focus:ring-blue-100 ${
          selected.length > 0
            ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {label}
        <svg
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""} ${selected.length > 0 ? "text-blue-500" : "text-slate-400"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                selected.includes(s) ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                selected.includes(s) ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
              }`}>
                {selected.includes(s) && (
                  <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              {s}
            </button>
          ))}
          {selected.length > 0 && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
