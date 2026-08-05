"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { updateRequestStatus } from "../actions";
import { NewRequestModal } from "@/components/new-request-modal";
import { useAuditNav } from "@/components/audit-nav-context";
import {
  type RequestCard,
  RequestCardView,
  DraggableRequestCard,
  DroppableColumn,
} from "@/components/kanban-request-card";

type StatusColumn = { id: string; name: string; order: number; color: string };

const statusColors = [
  { name: "Blue", value: "#3b82f6", bg: "bg-blue-200" },
  { name: "Purple", value: "#a855f7", bg: "bg-purple-200" },
  { name: "Green", value: "#22c55e", bg: "bg-green-200" },
  { name: "Yellow", value: "#eab308", bg: "bg-yellow-200" },
  { name: "Red", value: "#ef4444", bg: "bg-red-200" },
  { name: "Orange", value: "#f97316", bg: "bg-orange-200" },
  { name: "Pink", value: "#ec4899", bg: "bg-pink-200" },
  { name: "Indigo", value: "#6366f1", bg: "bg-indigo-200" },
  { name: "Teal", value: "#14b8a6", bg: "bg-teal-200" },
  { name: "Slate", value: "#64748b", bg: "bg-slate-200" },
  { name: "Lavender", value: "#8b5cf6", bg: "bg-violet-200" },
  { name: "Mint", value: "#10b981", bg: "bg-emerald-200" },
  { name: "Sky", value: "#0ea5e9", bg: "bg-sky-200" },
  { name: "Rose", value: "#f43f5e", bg: "bg-rose-200" },
  { name: "Amber", value: "#f59e0b", bg: "bg-amber-200" },
  { name: "Lime", value: "#84cc16", bg: "bg-lime-200" },
];

export default function KanbanBoardUI({
  audit,
  currentUser,
  dashboardBase = "/userDashboard",
}: {
  audit: {
    id: string;
    title: string;
    roomLabel: string;
    frontRoomsCount: number;
    statusColumns: StatusColumn[];
    requests: RequestCard[];
  };
  currentUser: { id: string; name: string; isAdmin: boolean; roles: string };
  dashboardBase?: string;
}) {
  const router = useRouter();
  const { setActiveAudit } = useAuditNav();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticRequests, setOptimisticRequests] = useState(audit.requests);
  const [query, setQuery] = useState("");
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  const handleRequestClick = (_requestId: string, _requestTitle: string, navigateTo: string, _resetLoading?: () => void) => {
    router.push(navigateTo);
  };

  // Allow new request creation for FR Lead, FR QM, BR Lead, BR QM, or admins
  const [liveRoles, setLiveRoles] = useState(currentUser.roles);
  const canCreateRequest = currentUser.isAdmin || /\bFR\d+\s+(Lead|QM)\b/i.test(liveRoles) || /\bBR\d+\s+(Lead|QM)\b/i.test(liveRoles);

  useEffect(() => {
    setOptimisticRequests(audit.requests);
  }, [audit.requests]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveAudit({ id: audit.id, title: audit.title, tab: "kanban", canCreateRequest });
    return () => setActiveAudit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id, audit.title, canCreateRequest]);

  // SSE: refresh roles and board on audit events
  useEffect(() => {
    const auditId = audit.id;
    const fetchRoles = async () => {
      try {
        const res = await fetch(`/api/audits/${auditId}/assignment`);
        if (!res.ok) return;
        const data = (await res.json()) as { roles: string };
        if (data.roles !== undefined) setLiveRoles(data.roles);
      } catch { /* ignore */ }
    };
    const es = new EventSource(`/api/audits/${auditId}/stream`);
    es.onmessage = (e) => {
      if (e.data === "kanban" || e.data === "requests") router.refresh();
      if (e.data === "assignment") void fetchRoles();
    };
    const onVisible = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { es.close(); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id, router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const requestId = active.id as string;
    const newColumnId = over.id as string;
    const request = optimisticRequests.find((r) => r.id === requestId);
    if (!request || request.statusColumnId === newColumnId) return;
    const newColumn = audit.statusColumns.find((c) => c.id === newColumnId);
    if (!newColumn) return;
    setOptimisticRequests((prev) =>
      prev.map((r) => r.id === requestId ? { ...r, statusColumnId: newColumnId, statusName: newColumn.name } : r),
    );
    const result = await updateRequestStatus(requestId, newColumnId, audit.id);
    if (result.ok) {
      router.refresh();
    } else {
      setOptimisticRequests(audit.requests);
      alert(result.error ?? "Failed to move request");
    }
  };

  const activeDraggedRequest = activeId ? optimisticRequests.find((r) => r.id === activeId) : null;

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return optimisticRequests;
    return optimisticRequests.filter((r) => {
      const key = (r.trackNumber ?? r.title).toLowerCase();
      const labels = r.labels.some((l) => l.toLowerCase().includes(q));
      return key.includes(q) || r.title.toLowerCase().includes(q) || labels;
    });
  }, [optimisticRequests, query]);

  const requestsByColumn = useMemo(() => {
    const map = new Map<string, RequestCard[]>();
    for (const c of audit.statusColumns) map.set(c.id, []);
    for (const r of filteredRequests) {
      if (!r.statusColumnId) continue;
      map.get(r.statusColumnId)?.push(r);
    }
    return map;
  }, [filteredRequests, audit.statusColumns]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-50 via-cyan-50/30 to-transparent" />

      <div className="relative mx-auto w-full max-w-none px-4 sm:px-6 xl:px-10 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="w-full text-center flex flex-col items-center">
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl w-full max-w-4xl break-words">
              {audit.title}
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
            {canCreateRequest && (
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

        {/* Status banner */}
        <div className="mb-6 flex flex-wrap gap-3 justify-center">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</span>
            <span className="text-sm font-bold text-slate-900">{optimisticRequests.length}</span>
          </div>
          {audit.statusColumns.slice().sort((a, b) => a.order - b.order).map((col) => {
            const count = optimisticRequests.filter((r) => r.statusColumnId === col.id).length;
            return (
              <div key={col.id} className="flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 shadow-sm" style={{ borderColor: col.color + "55" }}>
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                <span className="text-xs font-semibold text-slate-600">{col.name}</span>
                <span className="text-sm font-bold" style={{ color: col.color }}>{count}</span>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="mb-6 flex justify-center">
          <div className="relative w-full max-w-sm">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by track #, title, or label..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* Kanban board */}
        {mounted ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-5">
                {audit.statusColumns
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((col) => {
                    const cards = requestsByColumn.get(col.id) ?? [];
                    const colorInfo = statusColors.find((sc) => sc.value === col.color) ?? statusColors[0]!;
                    return (
                      <DroppableColumn key={col.id} id={col.id} className="w-[360px]">
                        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <div className={`flex items-center justify-between border-b border-slate-200 px-4 py-3 rounded-t-2xl ${colorInfo.bg}`}>
                            <div className="truncate text-sm font-semibold text-slate-900">{col.name}</div>
                            <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-300">
                              {cards.length}
                            </div>
                          </div>
                          <div className="p-4 rounded-b-2xl">
                            <div className={`space-y-3 overflow-y-auto px-1 py-1 ${cards.length > 0 ? "max-h-[600px] 2xl:max-h-[72vh]" : ""}`}>
                              {cards.map((r) => (
                                <DraggableRequestCard
                                  key={r.id}
                                  req={r}
                                  roomLabel={audit.roomLabel}
                                  statusColor={col.color}
                                  onClick={(reset) => void handleRequestClick(r.id, r.trackNumber ?? r.title, `${dashboardBase}/audits/${audit.id}/requests/${r.id}`, reset)}
                                  onCommentsClick={(e) => { e.stopPropagation(); void handleRequestClick(r.id, r.trackNumber ?? r.title, `${dashboardBase}/audits/${audit.id}/requests/${r.id}#comments`); }}
                                />
                              ))}
                              {cards.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
                                  <div className="text-4xl mb-2 opacity-40">📭</div>
                                  No requests
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </DroppableColumn>
                    );
                  })}
              </div>
            </div>

            <DragOverlay>
              {activeDraggedRequest ? (
                <div className="opacity-95">
                  <RequestCardView
                    req={activeDraggedRequest}
                    roomLabel={audit.roomLabel}
                    statusColor={
                      audit.statusColumns.find((c) => c.id === activeDraggedRequest.statusColumnId)?.color ?? "#64748b"
                    }
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          // SSR skeleton
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-5">
              {audit.statusColumns
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((col) => {
                  const cards = requestsByColumn.get(col.id) ?? [];
                  return (
                    <div key={col.id} className="w-[360px]">
                      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                            <div className="truncate text-sm font-semibold text-slate-900">{col.name}</div>
                          </div>
                          <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            {cards.length}
                          </div>
                        </div>
                        <div className="p-4">
                          <div className={`space-y-3 overflow-y-auto px-1 py-1 ${cards.length > 0 ? "max-h-[600px] 2xl:max-h-[72vh]" : ""}`}>
                            {cards.map((r) => (
                              <RequestCardView
                                key={r.id}
                                req={r}
                                roomLabel={audit.roomLabel}
                                statusColor={col.color}
                                onClick={(reset) => void handleRequestClick(r.id, r.trackNumber ?? r.title, `${dashboardBase}/audits/${audit.id}/requests/${r.id}`, reset)}
                                onCommentsClick={(e) => { e.stopPropagation(); void handleRequestClick(r.id, r.trackNumber ?? r.title, `${dashboardBase}/audits/${audit.id}/requests/${r.id}#comments`); }}
                              />
                            ))}
                            {cards.length === 0 && (
                              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
                                <div className="text-4xl mb-2 opacity-40">📭</div>
                                No requests
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* New Request Modal */}
        {canCreateRequest && showNewRequestModal && (
          <NewRequestModal
            auditId={audit.id}
            auditTitle={audit.title}
            frontRoomsCount={audit.frontRoomsCount}
            onClose={() => setShowNewRequestModal(false)}
            onRequestCreated={() => router.refresh()}
          />
        )}
      </div>
    </main>
  );
}



