"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

type FrRequest = {
  id: string;
  trackNumber: string | null;
  title: string;
  statusName: string;
  createdAt: string;
};

const NEW_THRESHOLD_MS = 30_000; // highlight new chips for 30 s

export function FrRequestsStrip({
  auditId,
  frIndex,
}: {
  auditId: string;
  frIndex: number;
}) {
  const storageKey = `fr-strip-collapsed-${auditId}-${frIndex}`;

  const [requests, setRequests] = useState<FrRequest[]>([]);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(storageKey);
    return stored === null ? true : stored === "1";
  });
  // Track which IDs were seen on first load so we can highlight new ones
  const seenIdsRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      (r.trackNumber ?? r.title).toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q),
    );
  }, [requests, query]);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/audits/${auditId}/fr-requests?frIndex=${frIndex}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { requests: FrRequest[] };

      setRequests((prev) => {
        if (seenIdsRef.current === null) {
          // First load — nothing is "new"
          seenIdsRef.current = new Set(data.requests.map((r) => r.id));
          return data.requests;
        }

        // Find genuinely new IDs
        const incoming = new Set(data.requests.map((r) => r.id));
        const fresh: string[] = [];
        for (const id of incoming) {
          if (!seenIdsRef.current.has(id)) fresh.push(id);
        }
        if (fresh.length > 0) {
          for (const id of fresh) seenIdsRef.current.add(id);
          setNewIds((s) => {
            const next = new Set(s);
            for (const id of fresh) next.add(id);
            return next;
          });
          // Auto-expand when a new request arrives
          setCollapsed(false);
          localStorage.removeItem(storageKey);
          // Remove highlight after threshold
          setTimeout(() => {
            setNewIds((s) => {
              const next = new Set(s);
              for (const id of fresh) next.delete(id);
              return next;
            });
          }, NEW_THRESHOLD_MS);
        }

        // Preserve order — append new ones at end
        const prevMap = new Map(prev.map((r) => [r.id, r]));
        const merged: FrRequest[] = [];
        for (const r of data.requests) {
          merged.push(prevMap.get(r.id) ?? r);
        }
        return merged;
      });
    } catch {
      // silently ignore
    }
  }, [auditId, frIndex, storageKey]);

  // Initial fetch + SSE-driven refetch
  useEffect(() => {
    void fetchRequests();
    const es = new EventSource(`/api/audits/${auditId}/stream`);
    es.onmessage = (e) => {
      if (e.data === "requests" || e.data === "kanban") void fetchRequests();
    };
    const onVisible = () => { if (!document.hidden) void fetchRequests(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { es.close(); document.removeEventListener("visibilitychange", onVisible); };
  }, [auditId, fetchRequests]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      if (next) localStorage.setItem(storageKey, "1");
      else localStorage.removeItem(storageKey);
      return next;
    });
  };

  if (requests.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
      {!collapsed && (
        <div className="mb-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-amber-500 dark:text-amber-300">
              🔍
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search requests..."
              className="fr-requests-search h-8 w-full rounded-lg border py-1 pl-8 pr-2 text-xs outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Label */}
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Requests
        </span>

        {/* Chips */}
        {!collapsed && (
          <div className="flex max-h-24 min-w-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto pr-1">
            {filteredRequests.map((r) => {
              const isNew = newIds.has(r.id);
              const label = r.trackNumber ?? r.title;
              return (
                <a
                  key={r.id}
                  href={`/api/requests/${r.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={r.title}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition hover:shadow-sm",
                    isNew
                      ? "animate-pulse border-amber-400 bg-amber-100 text-amber-800 shadow-sm hover:bg-amber-200 dark:border-amber-500 dark:bg-amber-700/40 dark:text-amber-100 dark:hover:bg-amber-700/55"
                      : "border-amber-200 bg-amber-50 text-amber-800 shadow-sm hover:border-amber-400 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-200 dark:hover:border-amber-600 dark:hover:bg-amber-900/45",
                  ].join(" ")}
                >
                  {isNew && (
                    <span className="mr-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-300" />
                  )}
                  {label}
                  <svg className="h-2.5 w-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              );
            })}

            {filteredRequests.length === 0 && (
              <span className="rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                No requests found
              </span>
            )}
          </div>
        )}

        {collapsed && (
          <span className="text-[11px] text-amber-600 dark:text-amber-300">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Count badge + collapse toggle */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-800 dark:text-amber-200">
            {requests.length}
          </span>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand" : "Collapse"}
            className="flex h-5 w-5 items-center justify-center rounded text-amber-500 transition hover:bg-amber-200 hover:text-amber-700 dark:text-amber-300 dark:hover:bg-amber-800/70 dark:hover:text-amber-100"
          >
            <svg
              className={`h-3 w-3 transition-transform ${collapsed ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
