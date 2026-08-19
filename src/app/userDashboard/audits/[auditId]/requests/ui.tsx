"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuditNav, useAuditStreamEvent } from "@/components/audit-nav-context";
import { NewRequestModal } from "@/components/new-request-modal";
import { getLabelPillClass } from "@/components/labelColors";

type RequestRow = {
  id: string;
  trackNumber: string | null;
  title: string;
  labels: string[];
  isFormal: boolean;
  createdAt: string;
  closedAt: string | null;
  auditTitle: string;
  createdByName: string;
  statusName: string;
  statusColor: string;
  statusOrder: number;
  auditId: string;
  assigneeIds: string[];
  createdById: string | null;
  estimatedDeliveryDate: string | null;
};

type SortKey =
  | "track"
  | "status"
  | "labels"
  | "createdBy"
  | "created"
  | "open"
  | "eta";

type SortDir = "asc" | "desc";

function labelSortKey(r: RequestRow): string {
  const frNums = r.labels
    .map((l) => /^FR(\d+)$/i.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => parseInt(m[1]!, 10))
    .sort((a, b) => a - b);
  const frPart = frNums.length
    ? frNums.map((n) => String(n).padStart(6, "0")).join(",")
    : "~";
  const formalPart = r.isFormal ? "1" : "0";
  const rest = r.labels
    .filter((l) => !/^FR\d+$/i.test(l))
    .map((l) => l.toLowerCase())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .join(",");
  return `${frPart}|${formalPart}|${rest}`;
}

function sortValue(r: RequestRow, key: SortKey, now: number): number | string {
  switch (key) {
    case "track":
      return (r.trackNumber ?? r.title).toLowerCase();
    case "status":
      return r.statusOrder;
    case "labels":
      return labelSortKey(r);
    case "createdBy":
      return r.createdByName.toLowerCase();
    case "created":
      return new Date(r.createdAt).getTime();
    case "open": {
      const end = r.closedAt ? new Date(r.closedAt).getTime() : now;
      return end - new Date(r.createdAt).getTime();
    }
    case "eta":
      return r.estimatedDeliveryDate ? new Date(r.estimatedDeliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
  }
}

function timeOpen(createdAt: string, closedAt: string | null): string {
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const diffMs = end - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export default function AllRequestsUserClient({
  user,
  currentUserId,
  requests,
  statusMap,
  auditId,
  auditTitle,
  frontRoomsCount = 1,
  canCreateRequest = false,
  dashboardBase = "/userDashboard",
}: {
  user: { name: string };
  currentUserId: string;
  requests: RequestRow[];
  statusMap: Record<string, { count: number; color: string; order: number }>;
  auditId: string;
  auditTitle: string;
  frontRoomsCount?: number;
  canCreateRequest?: boolean;
  dashboardBase?: string;
}) {
  const router = useRouter();
  const { setActiveAudit } = useAuditNav();
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<string>("All");
  const [filterAssigned, setFilterAssigned] = useState(false);
  const [filterCreated, setFilterCreated] = useState(false);
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [liveCanCreate, setLiveCanCreate] = useState(canCreateRequest);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created" || key === "open" ? "desc" : "asc");
    }
  };

  const handleRequestClick = (requestId: string, _requestTitle: string, requestAuditId: string) => {
    setLoadingId(requestId);
    router.push(`${dashboardBase}/audits/${requestAuditId}/requests/${requestId}`);
  };

  useEffect(() => {
    setActiveAudit({ id: auditId, title: auditTitle, tab: "requests", canCreateRequest: liveCanCreate });
    return () => setActiveAudit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, auditTitle, liveCanCreate]);

  // SSE: refresh roles when assignment changes (shared connection via AuditNavProvider)
  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits/${auditId}/assignment`);
      if (!res.ok) return;
      const data = (await res.json()) as { roles: string };
      if (data.roles !== undefined) {
        const can = /\bFR\d+\s+(Lead|QM)\b/i.test(data.roles) || /\bBR\d+\s+(Lead|QM)\b/i.test(data.roles);
        setLiveCanCreate(can);
      }
    } catch { /* ignore */ }
  }, [auditId]);

  useAuditStreamEvent(
    useCallback(
      (data: string) => {
        if (data === "assignment") void fetchRoles();
      },
      [fetchRoles],
    ),
  );

  const statusEntries = useMemo(
    () => Object.entries(statusMap).sort((a, b) => a[1].order - b[1].order),
    [statusMap],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = requests.filter((r) => {
      const matchStatus = activeStatus === "All" || r.statusName === activeStatus;
      const formalLabel = r.isFormal ? "formal" : "informal";
      const matchQuery =
        !q ||
        (r.trackNumber ?? r.title).toLowerCase().includes(q) ||
        r.labels.some((l) => l.toLowerCase().includes(q)) ||
        formalLabel.startsWith(q);
      const matchMine =
        (!filterAssigned && !filterCreated) ||
        (filterAssigned && r.assigneeIds.includes(currentUserId)) ||
        (filterCreated && r.createdById === currentUserId);
      return matchStatus && matchQuery && matchMine;
    });
    const now = Date.now();
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sortKey, now);
      const vb = sortValue(b, sortKey, now);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [requests, query, activeStatus, filterAssigned, filterCreated, currentUserId, sortKey, sortDir]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-50 via-cyan-50/30 to-transparent" />
      <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="w-full text-center flex flex-col items-center">
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl w-full max-w-4xl break-words">
              {auditTitle}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              ← Back
            </button>
            {liveCanCreate && (
              <button
                type="button"
                onClick={() => setShowNewRequestModal(true)}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
              >
                + New Request
              </button>
            )}
          </div>
        </div>

        {/* Status summary cards */}
        <div className="mb-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setActiveStatus("All")}
            className={`w-32 rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${
              activeStatus === "All"
                ? "border-slate-400 bg-slate-900 text-white"
                : "border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <div className="text-2xl font-bold">{requests.length}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-80">All</div>
          </button>

          {statusEntries.map(([status, { count, color }]) => (
            <button
              key={status}
              type="button"
              onClick={() => setActiveStatus(status)}
              className={`w-32 rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${
                activeStatus === status ? "" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-opacity-60 dark:hover:border-slate-600"
              }`}
              style={
                activeStatus === status
                  ? {
                      borderColor: color,
                      backgroundColor: color + "14",
                      outline: `2px solid ${color}`,
                      outlineOffset: "0px",
                    }
                  : undefined
              }
            >
              <div
                className={`text-2xl font-bold ${activeStatus === status ? "" : "text-slate-900 dark:text-slate-100"}`}
                style={{ color: activeStatus === status ? color : undefined }}
              >
                {count}
              </div>
              <div
                className={`mt-1 text-xs font-semibold uppercase tracking-wide opacity-75 ${activeStatus === status ? "" : "text-slate-500 dark:text-slate-400"}`}
                style={{ color: activeStatus === status ? color : undefined }}
              >
                {status}
              </div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              🔍
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by track #, title, or label..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          {activeStatus !== "All" && (
            <button
              type="button"
              onClick={() => setActiveStatus("All")}
              className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              ✕ Clear filter
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterAssigned((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                filterAssigned
                  ? "border-blue-500 bg-blue-500 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Assigned to Me
            </button>
            <button
              type="button"
              onClick={() => setFilterCreated((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                filterCreated
                  ? "border-violet-500 bg-violet-500 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Created by Me
            </button>
            <span className="text-sm text-slate-500">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center shadow-sm">
            <div className="mb-3 text-5xl">📭</div>
            <div className="text-lg font-semibold text-slate-900">No requests found</div>
            <div className="mt-1 text-sm text-slate-500">
              {query ? "Try a different search term." : "There are no requests yet."}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <SortableTh label="Track #" sortKey="track" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh label="Status" sortKey="status" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh label="Labels" sortKey="labels" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh label="Created By" sortKey="createdBy" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh label="Created" sortKey="created" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh label="Open" sortKey="open" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh label="ETA" sortKey="eta" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => handleRequestClick(r.id, r.trackNumber ?? r.title, r.auditId)}
                      className={`cursor-pointer transition hover:bg-slate-50 ${loadingId === r.id ? "bg-slate-50 opacity-70" : ""}`}
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold text-slate-700">
                        <div className="flex items-center gap-2">
                          {loadingId === r.id && (
                            <svg className="h-4 w-4 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                          {r.trackNumber ? (
                            <span>{r.trackNumber}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                          style={{
                            backgroundColor: r.statusColor + "14",
                            borderColor: r.statusColor + "55",
                            color: r.statusColor,
                          }}
                        >
                          {r.statusName}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          {(r.labels.some((lbl) => /^FR\d+$/i.test(lbl))) && (
                            <div className="flex flex-wrap gap-1">
                              {r.labels.filter((lbl) => /^FR\d+$/i.test(lbl)).map((lbl) => (
                                <span key={lbl} className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-rose-600 text-white">
                                  {lbl}
                                </span>
                              ))}
                              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${r.isFormal ? "bg-violet-600 text-white" : "bg-amber-500 text-white"}`}>
                                {r.isFormal ? "Formal" : "Informal"}
                              </span>
                            </div>
                          )}
                          {r.labels.filter((lbl) => !/^FR\d+$/i.test(lbl)).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {r.labels.filter((lbl) => !/^FR\d+$/i.test(lbl)).slice(0, 4).map((lbl) => (
                                <span
                                  key={lbl}
                                  className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold ${getLabelPillClass(lbl)}`}
                                >
                                  {lbl}
                                </span>
                              ))}
                              {r.labels.filter((lbl) => !/^FR\d+$/i.test(lbl)).length > 4 && (
                                <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  +{r.labels.filter((lbl) => !/^FR\d+$/i.test(lbl)).length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-700">
                        {r.createdByName || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                        <div>{new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} UTC</div>
                        <div className="text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs font-medium text-slate-500">
                        <span className="inline-flex items-center gap-1.5" title={r.closedAt ? `Closed ${new Date(r.closedAt).toLocaleString(undefined, { timeZone: "UTC" })} UTC` : "Open"}>
                          <span className={`h-1.5 w-1.5 rounded-full ${r.closedAt ? "bg-slate-300" : "bg-green-500"}`} aria-hidden="true" />
                          {timeOpen(r.createdAt, r.closedAt)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                        {r.estimatedDeliveryDate ? (
                          `${new Date(r.estimatedDeliveryDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} UTC`
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {liveCanCreate && showNewRequestModal && (
        <NewRequestModal
          auditId={auditId}
          auditTitle={auditTitle}
          frontRoomsCount={frontRoomsCount}
          onClose={() => setShowNewRequestModal(false)}
        />
      )}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  current,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  const indicator = active ? (dir === "asc" ? "▲" : "▼") : "↕";
  return (
    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 transition hover:text-slate-900 dark:hover:text-white ${active ? "text-slate-900 dark:text-white" : ""}`}
      >
        <span>{label}</span>
        <span className={`text-[10px] ${active ? "opacity-100" : "opacity-40"}`} aria-hidden="true">
          {indicator}
        </span>
      </button>
    </th>
  );
}
