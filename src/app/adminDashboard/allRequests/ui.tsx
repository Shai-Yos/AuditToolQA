"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { getLabelPillClass } from "@/components/labelColors";

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
  auditStatus: string;
  createdById: string | null;
  assigneeIds: string[];
  estimatedDeliveryDate: string | null;
};

type SortKey =
  | "track"
  | "audit"
  | "status"
  | "labels"
  | "createdBy"
  | "created"
  | "open";

type SortDir = "asc" | "desc";

function labelSortKey(r: RequestRow): string {
  const frNums = r.labels
    .map((l) => /^FR(\d+)$/i.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => parseInt(m[1]!, 10))
    .sort((a, b) => a - b);
  const frPart = frNums.length
    ? frNums.map((n) => String(n).padStart(6, "0")).join(",")
    : "~"; // sort no-FR rows last
  const formalPart = r.isFormal ? "1" : "0"; // informal first
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
    case "audit":
      return r.auditTitle.toLowerCase();
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
  }
}

export default function AllRequestsClient({
  user,
  currentUserId,
  requests,
  statusMap,
  audits,
}: {
  user: { name: string };
  currentUserId: string;
  requests: RequestRow[];
  statusMap: Record<string, { count: number; color: string; order: number }>;
  audits: { id: string; title: string; status: string }[];
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<string>("All");
  const [auditScope, setAuditScope] = useState<"active" | "all">("active");
  const [selectedAuditIds, setSelectedAuditIds] = useState<string[]>([]);
  const [filterAssigned, setFilterAssigned] = useState(false);
  const [filterCreated, setFilterCreated] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string>("All");
  const [creatorFilter, setCreatorFilter] = useState<string>("All");
  const [etaFilter, setEtaFilter] = useState<"All" | "withEta" | "withoutEta">("All");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Requests and audits scoped by Audit header filter
  const scopeRequests = useMemo(
    () => (auditScope === "active" ? requests.filter((r) => r.auditStatus === "ACTIVE") : requests),
    [requests, auditScope],
  );

  const scopedAudits = useMemo(
    () => (auditScope === "active" ? audits.filter((a) => a.status === "ACTIVE") : audits),
    [audits, auditScope],
  );

  const scopedRequests = useMemo(
    () =>
      selectedAuditIds.length === 0
        ? scopeRequests
        : scopeRequests.filter((r) => selectedAuditIds.includes(r.auditId)),
    [scopeRequests, selectedAuditIds],
  );

  useEffect(() => {
    const allowed = new Set(scopedAudits.map((a) => a.id));
    setSelectedAuditIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [scopedAudits]);

  // Status counts derived from scoped requests (colors from server statusMap)
  const scopedStatusMap = useMemo(() => {
    const map: Record<string, { count: number; color: string; order: number }> = {};
    for (const r of scopedRequests) {
      if (!map[r.statusName]) {
        const existing = statusMap[r.statusName];
        map[r.statusName] = { count: 0, color: existing?.color ?? r.statusColor, order: existing?.order ?? r.statusOrder };
      }
      map[r.statusName]!.count += 1;
    }
    return map;
  }, [scopedRequests, statusMap]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created" || key === "open" ? "desc" : "asc");
    }
  };

  const statusEntries = useMemo(
    () => Object.entries(scopedStatusMap).sort((a, b) => a[1].order - b[1].order),
    [scopedStatusMap],
  );

  const labelOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const r of scopedRequests) {
      for (const l of r.labels) unique.add(l);
    }
    return [
      { value: "All", label: "All labels" },
      ...Array.from(unique)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
        .map((label) => ({ value: label, label })),
    ];
  }, [scopedRequests]);

  const creatorOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const r of scopedRequests) {
      if (r.createdByName) unique.add(r.createdByName);
    }
    return [
      { value: "All", label: "All creators" },
      ...Array.from(unique)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map((name) => ({ value: name, label: name })),
    ];
  }, [scopedRequests]);

  const statusFilterOptions = useMemo(
    () => [
      { value: "All", label: "All statuses" },
      ...statusEntries.map(([status]) => ({ value: status, label: status })),
    ],
    [statusEntries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = scopedRequests.filter((r) => {
      const requestType = r.isFormal ? "formal" : "informal";
      const matchesType = requestType.startsWith(q);
      const matchStatus = activeStatus === "All" || r.statusName === activeStatus;
      const matchLabel =
        labelFilter === "All" ||
        r.labels.some((l) => l.localeCompare(labelFilter, undefined, { sensitivity: "base" }) === 0);
      const matchCreator =
        creatorFilter === "All" ||
        r.createdByName.localeCompare(creatorFilter, undefined, { sensitivity: "base" }) === 0;
      const matchEta =
        etaFilter === "All" ||
        (etaFilter === "withEta" ? !!r.estimatedDeliveryDate : !r.estimatedDeliveryDate);
      const matchQuery =
        !q ||
        (r.trackNumber ?? r.title).toLowerCase().includes(q) ||
        r.auditTitle.toLowerCase().includes(q) ||
        r.labels.some((l) => l.toLowerCase().includes(q)) ||
        matchesType ||
        r.createdByName.toLowerCase().includes(q);
      const matchMine =
        (!filterAssigned && !filterCreated) ||
        (filterAssigned && r.assigneeIds.includes(currentUserId)) ||
        (filterCreated && r.createdById === currentUserId);
      return matchStatus && matchLabel && matchCreator && matchEta && matchQuery && matchMine;
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
  }, [
    scopedRequests,
    query,
    activeStatus,
    labelFilter,
    creatorFilter,
    etaFilter,
    filterAssigned,
    filterCreated,
    currentUserId,
    sortKey,
    sortDir,
  ]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />

      <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              All Requests
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Browse, search, and filter all requests across audits.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Status summary cards */}
        <div className="mb-8 flex flex-wrap justify-center gap-3">
          {/* "All" card */}
          <button
            type="button"
            onClick={() => setActiveStatus("All")}
            className={`w-32 rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${
              activeStatus === "All"
                ? "border-slate-400 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <div className="text-2xl font-bold">{scopedRequests.length}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-80">
              All
            </div>
          </button>

          {statusEntries.map(([status, { count, color }]) => (
            <button
              key={status}
              type="button"
              onClick={() => setActiveStatus(status)}
              className={`w-32 rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${
                activeStatus === status
                  ? ""
                  : "hover:border-opacity-60"
              }`}
              style={
                activeStatus === status
                  ? {
                      borderColor: color,
                      backgroundColor: color + "14",
                      outline: `2px solid ${color}`,
                      outlineOffset: "0px",
                    }
                  : { borderColor: isDark ? "#303d58" : "#e2e8f0", backgroundColor: isDark ? "#242d42" : "#fff" }
              }
            >
              <div
                className="text-2xl font-bold"
                style={{ color: activeStatus === status ? color : isDark ? "#e2eaf7" : "#0f172a" }}
              >
                {count}
              </div>
              <div
                className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-75"
                style={{ color: activeStatus === status ? color : isDark ? "#a0b2cc" : "#64748b" }}
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
              placeholder="Search by track #, title, audit, label, or creator..."
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
                  <SortableTh
                    label="Audit"
                    sortKey="audit"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    filter={
                      <AuditColumnFilterDropdown
                        scope={auditScope}
                        onScopeChange={setAuditScope}
                        selected={selectedAuditIds}
                        onSelectedChange={setSelectedAuditIds}
                        audits={scopedAudits
                          .slice()
                          .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))}
                      />
                    }
                  />
                  <SortableTh
                    label="Status"
                    sortKey="status"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    filter={
                      <ColumnFilterDropdown<string>
                        value={activeStatus}
                        onChange={setActiveStatus}
                        options={statusFilterOptions}
                      />
                    }
                  />
                  <SortableTh
                    label="Labels"
                    sortKey="labels"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    filter={
                      <ColumnFilterDropdown<string>
                        value={labelFilter}
                        onChange={setLabelFilter}
                        options={labelOptions}
                      />
                    }
                  />
                  <SortableTh
                    label="Created By"
                    sortKey="createdBy"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    filter={
                      <ColumnFilterDropdown<string>
                        value={creatorFilter}
                        onChange={setCreatorFilter}
                        options={creatorOptions}
                      />
                    }
                  />
                  <SortableTh label="Created" sortKey="created" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Open" sortKey="open" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      ETA
                      <ColumnFilterDropdown<"All" | "withEta" | "withoutEta">
                        value={etaFilter}
                        onChange={setEtaFilter}
                        options={[
                          { value: "All", label: "All ETA" },
                          { value: "withEta", label: "With ETA" },
                          { value: "withoutEta", label: "Without ETA" },
                        ]}
                      />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() =>
                      router.push(`/adminDashboard/audits/${r.auditId}/requests/${r.id}`)
                    }
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    {/* Track # */}
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold text-slate-700">
                      {r.trackNumber ? (
                        <span>{r.trackNumber}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Audit */}
                    <td className="max-w-[180px] px-5 py-4">
                      <Link
                        href={`/adminDashboard/audits/${r.auditId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="line-clamp-2 text-slate-600 hover:text-blue-700 hover:underline transition-colors"
                      >
                        {r.auditTitle || "—"}
                      </Link>
                    </td>

                    {/* Status */}
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

                    {/* Labels */}
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

                    {/* Created By */}
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                      {r.createdByName || <span className="text-slate-400">—</span>}
                    </td>

                    {/* Created */}
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                      <div>{new Date(r.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })} UTC</div>
                      <div className="text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</div>
                    </td>

                    {/* Open */}
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-medium text-slate-500">
                      <span className="inline-flex items-center gap-1.5" title={r.closedAt ? `Closed ${new Date(r.closedAt).toLocaleString(undefined, { timeZone: "UTC" })} UTC` : "Open"}>
                        <span className={`h-1.5 w-1.5 rounded-full ${r.closedAt ? "bg-slate-300" : "bg-green-500"}`} aria-hidden="true" />
                        {timeOpen(r.createdAt, r.closedAt)}
                      </span>
                    </td>

                    {/* ETA */}
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
    </div>
  );
}

function ColumnFilterDropdown<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== (options[0]?.value ?? "");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={[
          "rounded p-0.5 transition",
          active ? "text-blue-600" : "text-slate-400 hover:text-slate-700",
        ].join(" ")}
        title="Filter"
      >
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed z-50 min-w-[130px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5"
          style={{ top: pos.top, left: pos.left }}
        >
          <ul className="max-h-64 overflow-y-auto p-1">
            {options.map((o) => (
              <li
                key={o.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(o.value);
                  setOpen(false);
                }}
                className={[
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  value === o.value ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {value === o.value ? (
                  <svg className="h-3 w-3 shrink-0 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="h-3 w-3 shrink-0" />
                )}
                <span className="max-w-[280px] truncate">{o.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AuditColumnFilterDropdown({
  scope,
  onScopeChange,
  selected,
  onSelectedChange,
  audits,
}: {
  scope: "active" | "all";
  onScopeChange: (scope: "active" | "all") => void;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  audits: { id: string; title: string; status: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const active = scope !== "active" || selected.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleMenu(e: React.MouseEvent) {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  }

  function toggleAudit(id: string) {
    onSelectedChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function clearAll() {
    onScopeChange("active");
    onSelectedChange([]);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleMenu}
        className={[
          "rounded p-0.5 transition",
          active ? "text-blue-600" : "text-slate-400 hover:text-slate-700",
        ].join(" ")}
        title="Filter"
      >
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed z-50 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Scope
          </div>
          <div className="px-1 pb-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onScopeChange("active");
              }}
              className={[
                "mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                scope === "active" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              <span className={["h-2 w-2 rounded-full", scope === "active" ? "bg-blue-600" : "bg-slate-300"].join(" ")} />
              All active audits
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onScopeChange("all");
              }}
              className={[
                "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                scope === "all" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              <span className={["h-2 w-2 rounded-full", scope === "all" ? "bg-blue-600" : "bg-slate-300"].join(" ")} />
              All audits
            </button>
          </div>

          <div className="border-t border-slate-100 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Audits
          </div>
          <ul className="max-h-60 overflow-y-auto p-1">
            {audits.map((a) => {
              const checked = selected.includes(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAudit(a.id);
                    }}
                    className={[
                      "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                      checked ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-3.5 w-3.5 items-center justify-center rounded border",
                        checked ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white",
                      ].join(" ")}
                    >
                      {checked && (
                        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{a.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {(scope !== "active" || selected.length > 0) && (
            <div className="border-t border-slate-100 p-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
                className="flex w-full items-center rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
              >
                Reset audit filter
              </button>
            </div>
          )}
        </div>
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
  filter,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
  filter?: ReactNode;
}) {
  const active = current === sortKey;
  const indicator = active ? (dir === "asc" ? "▲" : "▼") : "↕";
  return (
    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      <span className="inline-flex items-center gap-1">
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
        {filter}
      </span>
    </th>
  );
}

