"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { getLabelPillClass } from "@/components/labelColors";

function timeOpen(createdAt: string, closedAt: string | null, nowMs: number): string {
  const end = closedAt ? new Date(closedAt).getTime() : nowMs;
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

function utcDateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function formatUtcDateLabel(value: string): string {
  return `${new Date(value + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })} UTC`;
}

function clampDropdownLeft(left: number, dropdownWidth: number): number {
  const viewportWidth = window.innerWidth;
  const margin = 8;
  const maxLeft = Math.max(margin, viewportWidth - dropdownWidth - margin);
  return Math.min(Math.max(left, margin), maxLeft);
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
  assignees: { id: string; name: string }[];
  estimatedDeliveryDate: string | null;
};

type SortKey =
  | "track"
  | "audit"
  | "status"
  | "labels"
  | "assignees"
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
    case "audit":
      return r.auditTitle.toLowerCase();
    case "status":
      return r.statusOrder;
    case "labels":
      return labelSortKey(r);
    case "assignees":
      return r.assignees
        .map((a) => a.name.toLowerCase())
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .join(",");
    case "createdBy":
      return r.createdByName.toLowerCase();
    case "created":
      return new Date(r.createdAt).getTime();
    case "eta":
      return r.estimatedDeliveryDate
        ? new Date(r.estimatedDeliveryDate + "T12:00:00Z").getTime()
        : Number.POSITIVE_INFINITY;
    case "open": {
      const end = r.closedAt ? new Date(r.closedAt).getTime() : now;
      return end - new Date(r.createdAt).getTime();
    }
  }
}

export default function AllRequestsOwnerClient({
  currentUserId,
  initialNowMs,
  requests,
  statusMap,
  audits,
}: {
  currentUserId: string;
  initialNowMs: number;
  requests: RequestRow[];
  statusMap: Record<string, { count: number; color: string; order: number }>;
  audits: { id: string; title: string; status: string }[];
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [query, setQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [auditScope, setAuditScope] = useState<"active" | "all">("active");
  const [activeAuditIds, setActiveAuditIds] = useState<string[]>([]);
  const [filterAssigned, setFilterAssigned] = useState(false);
  const [filterCreated, setFilterCreated] = useState(false);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [selectedCreatedDates, setSelectedCreatedDates] = useState<string[]>([]);
  const [selectedEtaDates, setSelectedEtaDates] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [nowMs, setNowMs] = useState(initialNowMs);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const scopedRequests = useMemo(
    () => (auditScope === "active" ? requests.filter((r) => r.auditStatus === "ACTIVE") : requests),
    [requests, auditScope],
  );

  const scopedAudits = useMemo(
    () => (auditScope === "active" ? audits.filter((a) => a.status === "ACTIVE") : audits),
    [audits, auditScope],
  );

  useEffect(() => {
    const allowed = new Set(scopedAudits.map((a) => a.id));
    setActiveAuditIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [scopedAudits]);

  const scopedStatusMap = useMemo(() => {
    const map: Record<string, { count: number; color: string; order: number }> = {};
    for (const r of scopedRequests) {
      if (!map[r.statusName]) {
        const existing = statusMap[r.statusName];
        map[r.statusName] = {
          count: 0,
          color: existing?.color ?? r.statusColor,
          order: existing?.order ?? r.statusOrder,
        };
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

  const statusFilterOptions = useMemo(
    () => statusEntries.map(([status]) => ({ value: status, label: status })),
    [statusEntries],
  );

  const labelOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const r of scopedRequests) {
      for (const l of r.labels) unique.add(l);
    }
    return Array.from(unique)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((label) => ({ value: label, label }));
  }, [scopedRequests]);

  const creatorOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const r of scopedRequests) {
      if (r.createdByName) unique.add(r.createdByName);
    }
    return Array.from(unique)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
  }, [scopedRequests]);

  const assigneeOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const r of scopedRequests) {
      for (const a of r.assignees) {
        if (!unique.has(a.id)) unique.set(a.id, a.name || "Unknown User");
      }
    }
    return Array.from(unique.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [scopedRequests]);

  const createdDateOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const r of scopedRequests) unique.add(utcDateKey(r.createdAt));
    return Array.from(unique)
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: formatUtcDateLabel(value) }));
  }, [scopedRequests]);

  const etaDateOptions = useMemo(() => {
    const unique = new Set<string>();
    let hasNoEta = false;
    for (const r of scopedRequests) {
      if (r.estimatedDeliveryDate) unique.add(utcDateKey(r.estimatedDeliveryDate));
      else hasNoEta = true;
    }
    const dated = Array.from(unique)
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: formatUtcDateLabel(value) }));
    return hasNoEta ? [...dated, { value: "__NO_ETA__", label: "No ETA" }] : dated;
  }, [scopedRequests]);

  useEffect(() => {
    const allowed = new Set(statusFilterOptions.map((o) => o.value));
    setSelectedStatuses((prev) => prev.filter((id) => allowed.has(id)));
  }, [statusFilterOptions]);

  useEffect(() => {
    const allowed = new Set(labelOptions.map((o) => o.value));
    setSelectedLabels((prev) => prev.filter((id) => allowed.has(id)));
  }, [labelOptions]);

  useEffect(() => {
    const allowed = new Set(creatorOptions.map((o) => o.value));
    setSelectedCreators((prev) => prev.filter((id) => allowed.has(id)));
  }, [creatorOptions]);

  useEffect(() => {
    const allowed = new Set(assigneeOptions.map((o) => o.value));
    setSelectedAssigneeIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [assigneeOptions]);

  useEffect(() => {
    const allowed = new Set(createdDateOptions.map((o) => o.value));
    setSelectedCreatedDates((prev) => prev.filter((id) => allowed.has(id)));
  }, [createdDateOptions]);

  useEffect(() => {
    const allowed = new Set(etaDateOptions.map((o) => o.value));
    setSelectedEtaDates((prev) => prev.filter((id) => allowed.has(id)));
  }, [etaDateOptions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = scopedRequests.filter((r) => {
      const requestType = r.isFormal ? "formal" : "informal";
      const matchesType = requestType.startsWith(q);
      const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(r.statusName);
      const matchAudit = activeAuditIds.length === 0 || activeAuditIds.includes(r.auditId);
      const matchLabel =
        selectedLabels.length === 0 ||
        r.labels.some((l) =>
          selectedLabels.some((sel) => l.localeCompare(sel, undefined, { sensitivity: "base" }) === 0),
        );
      const matchCreator =
        selectedCreators.length === 0 ||
        selectedCreators.some(
          (sel) => r.createdByName.localeCompare(sel, undefined, { sensitivity: "base" }) === 0,
        );
      const matchCreatedDate =
        selectedCreatedDates.length === 0 || selectedCreatedDates.includes(utcDateKey(r.createdAt));
      const etaValue = r.estimatedDeliveryDate ? utcDateKey(r.estimatedDeliveryDate) : "__NO_ETA__";
      const matchEtaDate = selectedEtaDates.length === 0 || selectedEtaDates.includes(etaValue);
      const matchAssignees =
        selectedAssigneeIds.length === 0 || r.assignees.some((a) => selectedAssigneeIds.includes(a.id));
      const matchQuery =
        !q ||
        (r.trackNumber ?? r.title).toLowerCase().includes(q) ||
        r.auditTitle.toLowerCase().includes(q) ||
        r.labels.some((l) => l.toLowerCase().includes(q)) ||
        matchesType ||
        r.createdByName.toLowerCase().includes(q);
      const matchMine =
        (!filterAssigned && !filterCreated) ||
        (filterAssigned && r.assignees.some((a) => a.id === currentUserId)) ||
        (filterCreated && r.createdById === currentUserId);
      return (
        matchStatus &&
        matchAudit &&
        matchLabel &&
        matchCreator &&
        matchCreatedDate &&
        matchEtaDate &&
        matchAssignees &&
        matchQuery &&
        matchMine
      );
    });

    const now = nowMs;
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
    selectedStatuses,
    activeAuditIds,
    selectedLabels,
    selectedCreators,
    selectedCreatedDates,
    selectedEtaDates,
    selectedAssigneeIds,
    filterAssigned,
    filterCreated,
    currentUserId,
    sortKey,
    sortDir,
    nowMs,
  ]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />

      <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">All Requests</h1>
            <p className="mt-1 text-sm text-slate-500">Browse, search, and filter all requests across audits.</p>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            ← Back
          </button>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Show:</span>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setAuditScope("active");
                setActiveAuditIds([]);
                setSelectedStatuses([]);
              }}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${
                auditScope === "active"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Active Audits
            </button>
            <button
              type="button"
              onClick={() => {
                setAuditScope("all");
                setActiveAuditIds([]);
                setSelectedStatuses([]);
              }}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${
                auditScope === "all" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Audits
            </button>
          </div>
          {auditScope === "all" && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Includes inactive
            </span>
          )}
        </div>

        <div className="mb-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setSelectedStatuses([])}
            className={`w-32 rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${
              selectedStatuses.length === 0
                ? "border-slate-400 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <div className="text-2xl font-bold">{scopedRequests.length}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-80">All</div>
          </button>

          {statusEntries.map(([status, { count, color }]) => (
            <button
              key={status}
              type="button"
              onClick={() =>
                setSelectedStatuses((prev) =>
                  prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
                )
              }
              className={`w-32 rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${
                selectedStatuses.includes(status) ? "" : "hover:border-opacity-60"
              }`}
              style={
                selectedStatuses.includes(status)
                  ? {
                      borderColor: color,
                      backgroundColor: color + "14",
                      outline: `2px solid ${color}`,
                      outlineOffset: "0px",
                    }
                  : {
                      borderColor: isDark ? "#303d58" : "#e2e8f0",
                      backgroundColor: isDark ? "#242d42" : "#fff",
                    }
              }
            >
              <div
                className="text-2xl font-bold"
                style={{ color: selectedStatuses.includes(status) ? color : isDark ? "#e2eaf7" : "#0f172a" }}
              >
                {count}
              </div>
              <div
                className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-75"
                style={{ color: selectedStatuses.includes(status) ? color : isDark ? "#a0b2cc" : "#64748b" }}
              >
                {status}
              </div>
            </button>
          ))}
        </div>

        {scopedAudits.length > 0 && (
          <div className="mb-5">
            <AuditFilterDropdown audits={scopedAudits} selected={activeAuditIds} onChange={setActiveAuditIds} />
          </div>
        )}

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by track #, title, audit, label, or creator..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          {selectedStatuses.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStatuses([])}
              className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800"
            >
              ✕ Clear status filter
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

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center shadow-sm">
            <div className="mb-3 text-5xl">📭</div>
            <div className="text-lg font-semibold text-slate-900">No requests found</div>
            <div className="mt-1 text-sm text-slate-500">
              {query ? "Try a different search term." : "There are no requests yet."}
            </div>
            {auditScope === "active" && scopedAudits.length === 0 && audits.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAuditScope("all");
                  setActiveAuditIds([]);
                  setSelectedStatuses([]);
                }}
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Show requests from inactive audits
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <SortableTh label="Track #" sortKey="track" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh label="Audit" sortKey="audit" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh
                      label="Status"
                      sortKey="status"
                      current={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      filter={
                        <MultiSelectFilterDropdown
                          selected={selectedStatuses}
                          onSelectedChange={setSelectedStatuses}
                          options={statusFilterOptions}
                          title="Filter by statuses"
                          emptyLabel="No statuses"
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
                        <MultiSelectFilterDropdown
                          selected={selectedLabels}
                          onSelectedChange={setSelectedLabels}
                          options={labelOptions}
                          title="Filter by labels"
                          emptyLabel="No labels"
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
                        <MultiSelectFilterDropdown
                          selected={selectedCreators}
                          onSelectedChange={setSelectedCreators}
                          options={creatorOptions}
                          title="Filter by creators"
                          emptyLabel="No creators"
                        />
                      }
                    />
                    <SortableTh
                      label="Assigned To"
                      sortKey="assignees"
                      current={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      filter={
                        <MultiSelectFilterDropdown
                          selected={selectedAssigneeIds}
                          onSelectedChange={setSelectedAssigneeIds}
                          options={assigneeOptions}
                          title="Filter by assignees"
                          emptyLabel="No assignees"
                        />
                      }
                    />
                    <SortableTh
                      label="Created"
                      sortKey="created"
                      current={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      filter={
                        <MultiSelectFilterDropdown
                          selected={selectedCreatedDates}
                          onSelectedChange={setSelectedCreatedDates}
                          options={createdDateOptions}
                          title="Filter by created dates"
                          emptyLabel="No created dates"
                        />
                      }
                    />
                    <SortableTh label="Open" sortKey="open" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh
                      label="ETA"
                      sortKey="eta"
                      current={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      filter={
                        <MultiSelectFilterDropdown
                          selected={selectedEtaDates}
                          onSelectedChange={setSelectedEtaDates}
                          options={etaDateOptions}
                          title="Filter by ETA dates"
                          emptyLabel="No ETA dates"
                        />
                      }
                    />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/auditOwnerDashboard/audits/${r.auditId}/requests/${r.id}`)}
                      className="cursor-pointer transition hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold text-slate-700">
                        {r.trackNumber ? <span>{r.trackNumber}</span> : <span className="text-slate-400">—</span>}
                      </td>

                      <td className="max-w-[180px] px-5 py-4">
                        <Link
                          href={`/auditOwnerDashboard/audits/${r.auditId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="line-clamp-2 text-slate-600 transition-colors hover:text-blue-700 hover:underline"
                        >
                          {r.auditTitle || "—"}
                        </Link>
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
                          {r.labels.some((lbl) => /^FR\d+$/i.test(lbl)) && (
                            <div className="flex flex-wrap gap-1">
                              {r.labels.filter((lbl) => /^FR\d+$/i.test(lbl)).map((lbl) => (
                                <span key={lbl} className="inline-flex items-center rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                  {lbl}
                                </span>
                              ))}
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                  r.isFormal ? "bg-violet-600 text-white" : "bg-amber-500 text-white"
                                }`}
                              >
                                {r.isFormal ? "Formal" : "Informal"}
                              </span>
                            </div>
                          )}
                          {r.labels.filter((lbl) => !/^FR\d+$/i.test(lbl)).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {r.labels
                                .filter((lbl) => !/^FR\d+$/i.test(lbl))
                                .slice(0, 4)
                                .map((lbl) => (
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

                      <td
                        className="max-w-[220px] px-5 py-4 text-sm text-slate-700 whitespace-normal break-words"
                        title={r.createdByName || ""}
                      >
                        {r.createdByName ? (
                          <span className="block leading-5">{r.createdByName}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td
                        className="max-w-[220px] px-5 py-4 text-sm text-slate-700 whitespace-normal break-words"
                        title={r.assignees.map((a) => a.name).join(", ")}
                      >
                        {r.assignees.length > 0 ? (
                          <span className="block leading-5">{r.assignees.map((a) => a.name).join(", ")}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                        <div>
                          {new Date(r.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          })}{" "}
                          UTC
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(r.createdAt).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                            hour12: false,
                          })}{" "}
                          UTC
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-xs font-medium text-slate-500">
                        <span
                          className="inline-flex items-center gap-1.5"
                          title={
                            r.closedAt
                              ? `Closed ${new Date(r.closedAt).toLocaleString("en-US", { timeZone: "UTC", hour12: false })} UTC`
                              : "Open"
                          }
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${r.closedAt ? "bg-slate-300" : "bg-green-500"}`}
                            aria-hidden="true"
                          />
                          {timeOpen(r.createdAt, r.closedAt, nowMs)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                        {r.estimatedDeliveryDate
                          ? `${new Date(r.estimatedDeliveryDate + "T12:00:00").toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              timeZone: "UTC",
                            })} UTC`
                          : <span className="text-slate-300">—</span>}
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

function MultiSelectFilterDropdown({
  selected,
  onSelectedChange,
  options,
  title,
  emptyLabel,
}: {
  selected: string[];
  onSelectedChange: (values: string[]) => void;
  options: { value: string; label: string }[];
  title: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 288 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const active = selected.length > 0;

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
      const width = Math.min(288, window.innerWidth - 16);
      setPos({ top: r.bottom + 4, left: clampDropdownLeft(r.left, width), width });
    }
    setOpen((v) => !v);
  }

  function toggleValue(value: string) {
    onSelectedChange(
      selected.includes(value)
        ? selected.filter((x) => x !== value)
        : [...selected, value],
    );
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
        title={title}
      >
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <ul className="max-h-64 overflow-y-auto p-1">
            {options.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-400">{emptyLabel}</li>
            )}
            {options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleValue(o.value);
                    }}
                    className={[
                      "flex w-full items-start gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
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
                    <span className="whitespace-normal break-words leading-5 text-left">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 && (
            <div className="border-t border-slate-100 p-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectedChange([]);
                }}
                className="flex w-full items-center rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AuditFilterDropdown({
  audits,
  selected,
  onChange,
}: {
  audits: { id: string; title: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 288 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const label =
    selected.length === 0
      ? "All Audits"
      : selected.length === 1
        ? (audits.find((a) => a.id === selected[0])?.title ?? "1 audit")
        : `${selected.length} audits selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            const width = Math.min(288, window.innerWidth - 16);
            setPos({ top: r.bottom + 6, left: clampDropdownLeft(r.left, width), width });
          }
          setOpen((v) => !v);
        }}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-4 focus:ring-blue-100 ${
          selected.length > 0
            ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <svg className="h-3.5 w-3.5 shrink-0 text-current opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        <span className="max-w-[220px] truncate">{label}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${selected.length > 0 ? "text-blue-500" : "text-slate-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed z-50 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <ul className="max-h-64 overflow-y-auto">
            {audits.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    selected.includes(a.id) ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                    selected.includes(a.id) ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
                  }`}>
                    {selected.includes(a.id) && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 truncate">{a.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {selected.length > 0 && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setOpen(false);
                }}
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
