"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";

export type ActiveAudit = { id: string; title: string; tab: string; canCreateRequest?: boolean; activeRequestId?: string; activeRequestTitle?: string } | null;

/** Which sidebar tabs have unseen activity */
export type TabDots = Record<string, boolean>;

type AuditNavCtx = {
  activeAudit: ActiveAudit;
  setActiveAudit: (a: ActiveAudit) => void;
  tabDots: TabDots;
};

const AuditNavContext = createContext<AuditNavCtx>({
  activeAudit: null,
  setActiveAudit: () => {},
  tabDots: {},
});

const TAB_KEYS = ["requests", "kanban", "assignees", "chat"] as const;

export function AuditNavProvider({ children }: { children: ReactNode }) {
  const [activeAudit, setActiveAudit] = useState<ActiveAudit>(null);
  const [tabDots, setTabDots] = useState<TabDots>({});

  // Stores the count the user last "saw" for each tab (keyed by auditId)
  const seenCounts = useRef<Record<string, number>>({});
  // Previous counts from last poll
  const prevCounts = useRef<Record<string, number>>({});

  // When user navigates to a new tab, mark the PREVIOUS tab as "seen" and clear its dot
  const handleSetActiveAudit = useCallback((a: ActiveAudit) => {
    setActiveAudit((prev) => {
      // Clear dot for the tab the user is leaving
      if (prev && prev.id) {
        const prevTab = prev.tab;
        const prevKey = `${prev.id}:${prevTab}`;
        const current = prevCounts.current[prevKey];
        if (current !== undefined) {
          seenCounts.current[prevKey] = current;
        }
        setTabDots((dots) => (dots[prevTab] ? { ...dots, [prevTab]: false } : dots));
      }
      // Also clear dot for the tab the user is navigating to (re-click same tab)
      if (a && a.id) {
        const newKey = `${a.id}:${a.tab}`;
        const current = prevCounts.current[newKey];
        if (current !== undefined) {
          seenCounts.current[newKey] = current;
        }
        setTabDots((dots) => (dots[a.tab] ? { ...dots, [a.tab]: false } : dots));
      }
      // Preserve canCreateRequest from previous state when navigating within the
      // same audit and the new call does not explicitly supply it.
      if (a && prev && a.id === prev.id && a.canCreateRequest === undefined && prev.canCreateRequest !== undefined) {
        return { ...a, canCreateRequest: prev.canCreateRequest };
      }
      return a;
    });
  }, []);

  // Fetch tab-counts for the active audit and update dots
  const fetchTabCounts = useCallback(async (auditId: string) => {
    try {
      const res = await fetch(`/api/audits/${auditId}/tab-counts`);
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, number>;

      const newDots: TabDots = {};
      for (const tab of TAB_KEYS) {
        const key = `${auditId}:${tab}`;
        const count = data[tab] ?? 0;
        prevCounts.current[key] = count;

        if (seenCounts.current[key] === undefined) {
          seenCounts.current[key] = count;
        }

        const unseen = count > seenCounts.current[key]!;
        newDots[tab] = unseen;
      }

      setTabDots((prev) => {
        const changed = TAB_KEYS.some((t) => prev[t] !== newDots[t]);
        return changed ? newDots : prev;
      });
    } catch {
      /* ignore network errors */
    }
  }, []);

  // SSE subscription for the active audit's tab-count updates
  useEffect(() => {
    if (!activeAudit?.id) {
      setTabDots({});
      return;
    }

    const auditId = activeAudit.id;
    void fetchTabCounts(auditId);

    const es = new EventSource(`/api/audits/${auditId}/stream`);
    es.onmessage = (e) => {
      if (e.data === "tab-counts" || e.data === "requests" || e.data === "kanban" || e.data === "chat") {
        void fetchTabCounts(auditId);
      }
    };

    // Slow fallback poll every 60s
    const id = setInterval(() => void fetchTabCounts(auditId), 60_000);
    return () => { es.close(); clearInterval(id); };
  }, [activeAudit?.id, fetchTabCounts]);

  return (
    <AuditNavContext.Provider
      value={{ activeAudit, setActiveAudit: handleSetActiveAudit, tabDots }}
    >
      {children}
    </AuditNavContext.Provider>
  );
}

export function useAuditNav() {
  return useContext(AuditNavContext);
}
