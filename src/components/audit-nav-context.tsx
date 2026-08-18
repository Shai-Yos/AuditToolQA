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

type StreamListener = (data: string) => void;

type TabCountsPayload = {
  type: "tab-counts";
  counts: Record<string, number>;
};

type AuditNavCtx = {
  activeAudit: ActiveAudit;
  setActiveAudit: (a: ActiveAudit) => void;
  tabDots: TabDots;
  subscribeToAuditStream: (listener: StreamListener) => () => void;
};

const AuditNavContext = createContext<AuditNavCtx>({
  activeAudit: null,
  setActiveAudit: () => {},
  tabDots: {},
  subscribeToAuditStream: () => () => {},
});

const TAB_KEYS = ["requests", "kanban", "assignees", "chat"] as const;

export function AuditNavProvider({ children }: { children: ReactNode }) {
  const [activeAudit, setActiveAudit] = useState<ActiveAudit>(null);
  const [tabDots, setTabDots] = useState<TabDots>({});

  // Stores the count the user last "saw" for each tab (keyed by auditId)
  const seenCounts = useRef<Record<string, number>>({});
  // Previous counts from last poll
  const prevCounts = useRef<Record<string, number>>({});
  // Extra listeners registered by page components (chats/kanban/requests/etc.)
  // so they can react to the SAME shared EventSource instead of opening
  // their own — avoids exhausting the browser's per-origin connection limit.
  const streamListeners = useRef<Set<StreamListener>>(new Set());

  const subscribeToAuditStream = useCallback((listener: StreamListener) => {
    streamListeners.current.add(listener);
    return () => { streamListeners.current.delete(listener); };
  }, []);

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

  const applyTabCounts = useCallback((auditId: string, data: Record<string, number>) => {
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
  }, []);

  // SSE subscription for the active audit's tab-count updates
  useEffect(() => {
    if (!activeAudit?.id) {
      setTabDots({});
      return;
    }

    const auditId = activeAudit.id;

    const es = new EventSource(`/api/audits/${auditId}/stream`);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as TabCountsPayload;
        if (payload?.type === "tab-counts" && payload.counts) {
          applyTabCounts(auditId, payload.counts);
        }
      } catch {
        // keep compatibility with string events while payload rollout is in progress
      }
      streamListeners.current.forEach((listener) => listener(e.data));
    };

    return () => { es.close(); };
  }, [activeAudit?.id, applyTabCounts]);

  return (
    <AuditNavContext.Provider
      value={{ activeAudit, setActiveAudit: handleSetActiveAudit, tabDots, subscribeToAuditStream }}
    >
      {children}
    </AuditNavContext.Provider>
  );
}

export function useAuditNav() {
  return useContext(AuditNavContext);
}

/**
 * Subscribe to the single shared per-audit EventSource owned by
 * AuditNavProvider, instead of opening a new EventSource. Multiple page
 * components (kanban, chats, requests, assignees, fr-requests-strip, ...)
 * all need the same `/api/audits/{auditId}/stream` events; consolidating
 * them into one connection avoids hitting the browser's per-origin
 * connection cap (6 under HTTP/1.1, which `next dev` uses locally),
 * which otherwise can starve out navigation/RSC fetches.
 */
export function useAuditStreamEvent(onEvent: (data: string) => void) {
  const { subscribeToAuditStream } = useContext(AuditNavContext);
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(
    () => subscribeToAuditStream((data) => onEventRef.current(data)),
    [subscribeToAuditStream],
  );
}
