"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { updateRequestAssignees, updateRequestBasic, type UpdateRequestBasicInput, type UpdateRequestAssigneesInput } from "./actions";
import { useAuditNav } from "@/components/audit-nav-context";
import { addRequestComment, deleteRequestComment, saveRequestNote } from "~/server/lib/requestNotesComments";
import MentionTextarea, { renderMentionText } from "@/components/MentionTextarea";
import { api } from "@/trpc/react";
import { DatePicker } from "@/components/DatePicker";
import { RequestPrintView } from "@/components/request-print-view";

type State = { ok: true } | { ok: false; error: string };
const initialState: State = { ok: false, error: "" };

const FR_COLORS: { inactive: string; active: string }[] = [
  { inactive: "bg-red-50    text-red-700    ring-red-300    hover:bg-red-100",    active: "bg-red-600    text-white ring-red-600    scale-105 shadow-sm" },
  { inactive: "bg-orange-50 text-orange-700 ring-orange-300 hover:bg-orange-100", active: "bg-orange-500 text-white ring-orange-500 scale-105 shadow-sm" },
  { inactive: "bg-amber-50  text-amber-700  ring-amber-300  hover:bg-amber-100",  active: "bg-amber-500  text-white ring-amber-500  scale-105 shadow-sm" },
  { inactive: "bg-green-50  text-green-700  ring-green-300  hover:bg-green-100",  active: "bg-green-600  text-white ring-green-600  scale-105 shadow-sm" },
  { inactive: "bg-teal-50   text-teal-700   ring-teal-300   hover:bg-teal-100",   active: "bg-teal-600   text-white ring-teal-600   scale-105 shadow-sm" },
  { inactive: "bg-blue-50   text-blue-700   ring-blue-300   hover:bg-blue-100",   active: "bg-blue-600   text-white ring-blue-600   scale-105 shadow-sm" },
  { inactive: "bg-violet-50 text-violet-700 ring-violet-300 hover:bg-violet-100", active: "bg-violet-600 text-white ring-violet-600 scale-105 shadow-sm" },
  { inactive: "bg-pink-50   text-pink-700   ring-pink-300   hover:bg-pink-100",   active: "bg-pink-600   text-white ring-pink-600   scale-105 shadow-sm" },
];

const LABEL_PALETTE: Record<string, { inactive: string; active: string }> = {
  "P&PC":               { inactive: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300",           active: "border-blue-500 bg-blue-500 text-white shadow-sm" },
  "D&D":                { inactive: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-300", active: "border-violet-600 bg-violet-600 text-white shadow-sm" },
  "CAPA":               { inactive: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300",               active: "border-red-500 bg-red-500 text-white shadow-sm" },
  "Complaints":         { inactive: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:border-orange-300", active: "border-orange-500 bg-orange-500 text-white shadow-sm" },
  "C&R":                { inactive: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300",     active: "border-amber-500 bg-amber-500 text-white shadow-sm" },
  "Management Control": { inactive: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 hover:border-teal-300",         active: "border-teal-600 bg-teal-600 text-white shadow-sm" },
  "Training":           { inactive: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300",     active: "border-green-600 bg-green-600 text-white shadow-sm" },
  "ICQA":               { inactive: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:border-cyan-300",         active: "border-cyan-600 bg-cyan-600 text-white shadow-sm" },
  "PMS":                { inactive: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300", active: "border-indigo-600 bg-indigo-600 text-white shadow-sm" },
  "Risk":               { inactive: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300",         active: "border-rose-600 bg-rose-600 text-white shadow-sm" },
  "Regulatory":         { inactive: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-300", active: "border-purple-600 bg-purple-600 text-white shadow-sm" },
  "Tool Validation":    { inactive: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50 hover:border-slate-300",   active: "border-slate-600 bg-slate-600 text-white shadow-sm" },
  "HR":                 { inactive: "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 hover:border-pink-300",         active: "border-pink-600 bg-pink-600 text-white shadow-sm" },
  "IT":                 { inactive: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300",             active: "border-sky-600 bg-sky-600 text-white shadow-sm" },
  "Service":            { inactive: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300", active: "border-emerald-600 bg-emerald-600 text-white shadow-sm" },
};

const CUSTOM_LABEL_COLORS = [
  { border: "border-fuchsia-500", bg: "bg-fuchsia-500",  hover: "hover:bg-fuchsia-600" },
  { border: "border-lime-500",    bg: "bg-lime-500",     hover: "hover:bg-lime-600" },
  { border: "border-amber-500",   bg: "bg-amber-500",   hover: "hover:bg-amber-600" },
  { border: "border-cyan-500",    bg: "bg-cyan-500",    hover: "hover:bg-cyan-600" },
  { border: "border-rose-500",    bg: "bg-rose-500",    hover: "hover:bg-rose-600" },
  { border: "border-violet-500",  bg: "bg-violet-500",  hover: "hover:bg-violet-600" },
  { border: "border-orange-500",  bg: "bg-orange-500",  hover: "hover:bg-orange-600" },
  { border: "border-teal-500",    bg: "bg-teal-500",    hover: "hover:bg-teal-600" },
];

function getInitials(name: string) {
  const local = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  const cleaned = local.replace(/\(.*?\)/g, "").trim();
  const parts = cleaned.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return (((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?");
}

function PersonAvatar({ name, src, size = "sm" }: { name: string; src?: string | null; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const inits = getInitials(name);
  const dim = size === "md" ? "h-8 w-8" : "h-6 w-6";
  const textSize = size === "md" ? "text-[11px]" : "text-[9px]";
  return (
    <span className={`inline-flex ${dim} shrink-0 overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-600`}>
      {src && !failed ? (
        <img src={src} alt={name} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className={`flex h-full w-full items-center justify-center ${textSize} font-bold text-white`}>
          {inits}
        </span>
      )}
    </span>
  );
}

export default function RequestUI({
  auditId,
  auditTitle,
  auditTrackId,
  frontRoomsCount,
  request,
  auditPeople,
  statusColumns,
  note,
  comments,
  currentUserId,
  currentUserName,
  currentUserImage,
}: {
  auditId: string;
  auditTitle: string;
  auditTrackId: string | null;
  frontRoomsCount: number;
  request: {
    id: string;
    title: string;
    trackNumber: string | null;
    labels: string[];
    isFormal: boolean;
    statusColumnId: string;
    documents: { id: string; filename: string; url: string }[];
    assigneeIds: string[];
    estimatedDeliveryDate: string | null;
  };
  auditPeople: { id: string; name: string; image?: string | null }[];
  statusColumns: { id: string; name: string }[];
  note: { text: string; lastEditedBy: string | null; lastEditedAt: string | null };
  comments: { id: string; authorId: string; authorName: string; authorImage: string | null; text: string; createdAt: string }[];
  currentUserId: string;
  currentUserName: string;
  currentUserImage: string | null;
}) {
  const router = useRouter();
  const { setActiveAudit } = useAuditNav();

  const goBackToPreviousPage = () => {
    router.back();
  };

  const [lockState, setLockState] = useState<"checking" | "owned" | "blocked" | "error">("checking");
  const [lockOwner, setLockOwner] = useState<string | null>(null);

  // Page lock: hold lock while this page is open (check happens before navigation on the kanban)
  useEffect(() => {
    let heartbeat: ReturnType<typeof setInterval>;
    let ownsLock = false;
    const releaseUrl = `/api/requests/${request.id}/lock`;
    const releaseLock = () => {
      if (!ownsLock) return;
      // keepalive ensures the request survives page unload / component unmount
      fetch(releaseUrl, { method: "DELETE", keepalive: true }).catch(() => {});
    };
    const acquire = async () => {
      try {
        const res = await fetch(releaseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName: currentUserName }),
        });
        if (res.status === 409) {
          const data = (await res.json()) as { lockedByName?: string };
          setLockOwner(data.lockedByName ?? "Another user");
          setLockState("blocked");
          return;
        }
        if (!res.ok) {
          setLockState("error");
          return;
        }
        ownsLock = true;
        setLockState("owned");
        // Heartbeat every 10s to keep lock alive (TTL is 30s)
        heartbeat = setInterval(() => {
          fetch(releaseUrl, { method: "PATCH", keepalive: true }).catch(() => {});
        }, 10_000);
      } catch {
        setLockState("error");
      }
    };
    void acquire();
    // Also release on tab close / browser unload
    window.addEventListener("beforeunload", releaseLock);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", releaseLock);
      releaseLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  useEffect(() => {
    setActiveAudit({ id: auditId, title: auditTitle, tab: "requests", activeRequestId: request.id, activeRequestTitle: request.trackNumber ?? request.title });
    return () => setActiveAudit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, auditTitle, request.id, request.title]);

  // Scroll to #comments or #documents once the lock check is done and the layout is stable
  useEffect(() => {
    if (lockState === "checking") return;
    const hash = window.location.hash;
    if (hash !== "#comments" && hash !== "#documents") return;
    requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [lockState]);

  const STATIC_LABELS = [
    "P&PC", "D&D", "CAPA", "Complaints", "C&R", "Management Control",
    "Training", "ICQA", "PMS", "Risk", "Regulatory", "Tool Validation",
    "HR", "IT", "Service",
  ];

  // Derive initial FR and extra labels from the labels array
  const initialFR = request.labels.find((l) => /^FR\d+$/.test(l))?.replace("FR", "") ?? "1";
  const initialExtraLabels = request.labels.filter((l) => !/^FR\d+$/.test(l));

  const [selectedFR, setSelectedFR] = useState(initialFR);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(initialExtraLabels);
  const [customLabelInput, setCustomLabelInput] = useState("");
  const toggleLabel = (lbl: string) =>
    setSelectedLabels((prev) =>
      prev.includes(lbl) ? prev.filter((l) => l !== lbl) : [...prev, lbl]
    );

  const [basicPending, startBasicTransition] = useTransition();
  const [basicState, setBasicState] = useState<State>(initialState);
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState(request.estimatedDeliveryDate ?? "");
  const [assignPending, startAssignTransition] = useTransition();
  const [assignState, setAssignState] = useState<State>(initialState);
  const [assignSaved, setAssignSaved] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [debouncedAssigneeSearch, setDebouncedAssigneeSearch] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(request.assigneeIds);
  const [localPeopleMap, setLocalPeopleMap] = useState<Record<string, { id: string; name: string; email?: string | null; image?: string | null }>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAssigneeSearch(assigneeSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [assigneeSearch]);

  const { data: adResults = [], isFetching: adSearching } = api.user.searchDbUsers.useQuery(
    { query: debouncedAssigneeSearch },
    { enabled: debouncedAssigneeSearch.length >= 2 }
  );
  const [documents, setDocuments] = useState(request.documents);
  const [selectedStatus, setSelectedStatus] = useState(request.statusColumnId);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [liveComments, setLiveComments] = useState(comments);
  const [noteText, setNoteText] = useState(note.text);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteLastSaved, setNoteLastSaved] = useState(note.lastEditedAt);
  const [noteLastEditor, setNoteLastEditor] = useState(note.lastEditedBy);
  const [noteFocused, setNoteFocused] = useState(false);

  const fetchCommentsNotes = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch(`/api/requests/${request.id}/comments-notes`);
      if (!res.ok) return;
      const data = await res.json() as {
        comments: typeof comments;
        note: { text: string; lastEditedBy: string | null; lastEditedAt: string | null };
      };
      setLiveComments(data.comments);
      if (!noteFocused) {
        setNoteText(data.note.text);
      }
      setNoteLastSaved(data.note.lastEditedAt);
      setNoteLastEditor(data.note.lastEditedBy);
    } catch { /* ignore */ }
  }, [request.id, noteFocused]);

  useEffect(() => {
    const es = new EventSource(`/api/stream/request/${request.id}`);
    es.onmessage = (e) => {
      if (e.data === "comments" || e.data === "notes") void fetchCommentsNotes();
    };
    const onVisible = () => { if (!document.hidden) void fetchCommentsNotes(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { es.close(); document.removeEventListener("visibilitychange", onVisible); };
  }, [request.id, fetchCommentsNotes]);

  useEffect(() => {
    if (basicState.ok) {
      router.back();
    }
  }, [basicState.ok, router]);

  useEffect(() => {
    if (assignState.ok) {
      router.refresh();
    }
  }, [assignState.ok, router]);

  const isReadOnly = lockState !== "owned";

  return (
    <main className="min-h-screen bg-slate-50 print:bg-white print:min-h-0">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: `@media print { html, body { height: auto !important; min-height: 0 !important; } @page { size: A4 portrait; margin: 2cm 1.5cm 2.5cm 1.5cm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: system-ui, sans-serif; font-size: 9pt; color: #64748b; font-weight: 600; padding-right: 0.5cm; } } body, body * { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }` }} />
      <RequestPrintView data={{
        trackNumber: request.trackNumber,
        title: request.title,
        isFormal: request.isFormal,
        status: statusColumns.find(c => c.id === selectedStatus)?.name ?? "-",
        estimatedDeliveryDate: selectedDeliveryDate || null,
        fr: selectedFR,
        labels: selectedLabels,
        assignees: selectedAssignees.map(id => (localPeopleMap[id] ?? auditPeople.find(p => p.id === id))?.name ?? id),
        noteText,
        comments: liveComments.map(c => ({ authorName: c.authorName, text: c.text, createdAt: c.createdAt })),
        documents,
        auditTitle,
        auditTrackId,
      }} />
      {lockState === "blocked" && lockOwner && (
        <div className="print:hidden flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-6 py-3">
          <span className="text-lg">🔒</span>
          <p className="text-sm font-semibold text-amber-800">
            Read-only: <span className="font-bold">{lockOwner ?? "Another user"}</span> is currently editing this request.
          </p>
        </div>
      )}
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="print:hidden flex flex-col items-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">{request.trackNumber ?? request.title}</h1>
            <p className="mt-1 text-sm text-slate-600">Audit: {auditTitle}</p>
          </div>
          <div id="req-header-actions" className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={goBackToPreviousPage}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => {
                const original = document.title;
                const safeName = (request.trackNumber ?? request.title ?? "request")
                  .replace(/[\\/:*?"<>|]+/g, "-")
                  .trim();
                document.title = safeName || original;
                const restore = () => {
                  document.title = original;
                  window.removeEventListener("afterprint", restore);
                };
                window.addEventListener("afterprint", restore);
                window.print();
              }}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </div>
        </div>

        {/* Basic */}
        <section className="print:hidden mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">🗂️ Details</h2>

          <form id="basic-details-form" className="print:hidden mt-4 space-y-4" onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const titleEl = form.querySelector<HTMLInputElement>('input[name="title"]');
            const isFormalEl = form.querySelector<HTMLSelectElement>('select[name="isFormal"]');
            const input: UpdateRequestBasicInput = {
              auditId,
              requestId: request.id,
              title: titleEl?.value || "",
              isFormal: isFormalEl?.value || "false",
              statusColumnId: selectedStatus,
              frLabel: `FR${selectedFR}`,
              labels: selectedLabels,
              estimatedDeliveryDate: selectedDeliveryDate || undefined,
            };
            startBasicTransition(async () => {
              const result = await updateRequestBasic(basicState, input);
              setBasicState(result);
            });
          }}>
            <input type="hidden" name="auditId" value={auditId} />
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="statusColumnId" value={selectedStatus} />
            {/* FR label sent separately so action can prepend it */}
            <input type="hidden" name="frLabel" value={`FR${selectedFR}`} />
            {/* Extra labels as array */}
            {selectedLabels.map((lbl) => (
              <input key={lbl} type="hidden" name="labels" value={lbl} />
            ))}

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Title</span>
              <input
                name="title"
                defaultValue={request.title}
                disabled={isReadOnly}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Type</span>
                <select
                  name="isFormal"
                  defaultValue={request.isFormal ? "true" : "false"}
                  disabled={isReadOnly}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  <option value="false">Informal</option>
                  <option value="true">Formal</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Status</span>
                <select
                  value={selectedStatus}
                  disabled={isReadOnly}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  {statusColumns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className="text-sm font-semibold text-slate-700">Estimated Delivery Date</span>
              <div className="mt-2">
                <DatePicker
                  value={selectedDeliveryDate}
                  onChange={setSelectedDeliveryDate}
                  disabled={isReadOnly}
                  placeholder="Pick a delivery date…"
                />
              </div>
            </div>

            {!basicState.ok && basicState.error ? (
              <p className="text-sm text-red-600">{basicState.error}</p>
            ) : null}

            {/* Related FR */}
            <div>
              <span className="text-sm font-semibold text-slate-700">Related FR</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {Array.from({ length: frontRoomsCount }).map((_, i) => {
                  const val = String(i + 1);
                  const isSelected = selectedFR === val;
                  const colors = FR_COLORS[i % FR_COLORS.length]!;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => !isReadOnly && setSelectedFR(val)}
                      disabled={isReadOnly}
                      className={[
                        "px-3 py-1 rounded-full text-sm font-semibold ring-1 transition-all flex items-center gap-1 disabled:cursor-not-allowed",
                        isSelected ? colors.active : colors.inactive,
                      ].join(" ")}
                    >
                      {isSelected && <span className="text-base leading-none">✓</span>}
                      FR{i + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Labels */}
            <div>
              <span className="text-sm font-semibold text-slate-700">Labels</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {STATIC_LABELS.map((lbl) => {
                  const palette = LABEL_PALETTE[lbl] ?? { inactive: "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700", active: "border-blue-500 bg-blue-500 text-white shadow-sm" };
                  return (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => !isReadOnly && toggleLabel(lbl)}
                      disabled={isReadOnly}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 disabled:cursor-not-allowed",
                        selectedLabels.includes(lbl) ? palette.active : palette.inactive,
                      ].join(" ")}
                    >
                      {selectedLabels.includes(lbl) && <span className="text-base leading-none">✓</span>}
                      {lbl}
                    </button>
                  );
                })}
                {selectedLabels.filter((lbl) => !STATIC_LABELS.includes(lbl)).map((lbl, idx) => {
                  const c = CUSTOM_LABEL_COLORS[idx % CUSTOM_LABEL_COLORS.length]!;
                  return (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => !isReadOnly && toggleLabel(lbl)}
                      disabled={isReadOnly}
                      className={`rounded-full border ${c.border} ${c.bg} ${c.hover} px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      {lbl} ✕
                    </button>
                  );
                })}
                <div className="inline-flex items-center rounded-full border border-dashed border-slate-300 transition focus-within:border-blue-400">
                  <input
                    type="text"
                    value={customLabelInput}
                    onChange={(e) => setCustomLabelInput(e.target.value)}
                    disabled={isReadOnly}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = customLabelInput.trim();
                        if (val && !selectedLabels.includes(val)) toggleLabel(val);
                        setCustomLabelInput("");
                      }
                    }}
                    placeholder="Add..."
                    className="bg-transparent pl-3 py-1.5 w-14 text-xs font-semibold text-slate-500 outline-none placeholder:text-slate-400 focus:text-blue-700 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => {
                      const val = customLabelInput.trim();
                      if (val && !selectedLabels.includes(val)) toggleLabel(val);
                      setCustomLabelInput("");
                    }}
                    className="pr-2.5 pl-1 py-1.5 text-slate-400 hover:text-blue-600 transition font-bold text-base leading-none disabled:cursor-not-allowed outline-none focus:outline-none"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-center print:hidden">
              {!isReadOnly && (
              <button
                type="submit"
                disabled={basicPending}
                className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition-all"
              >
                {basicPending ? "Saving..." : "Save Details"}
              </button>
              )}
            </div>
          </form>
        </section>

        {/* Assignees */}
        <section className="print:hidden mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">👥 Assignees</h2>

          <form className="mt-4" onSubmit={(e) => {
            e.preventDefault();
            const input: UpdateRequestAssigneesInput = {
              auditId,
              requestId: request.id,
              assigneeIds: selectedAssignees,
              userMeta: Object.fromEntries(
                Object.entries(localPeopleMap).map(([id, p]) => [id, { name: p.name, email: p.email ?? undefined }])
              ),
            };
            startAssignTransition(async () => {
              const result = await updateRequestAssignees(assignState, input);
              setAssignState(result);
              if (result.ok) {
                setAssignSaved(true);
                setTimeout(() => setAssignSaved(false), 1500);
              }
            });
          }}>
            <input type="hidden" name="auditId" value={auditId} />
            <input type="hidden" name="requestId" value={request.id} />

            {/* Hidden checkboxes for form submission */}
            {selectedAssignees.map((id) => (
              <input key={id} type="hidden" name="assigneeIds" value={id} />
            ))}

            {/* Selected chips */}
            {selectedAssignees.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {selectedAssignees.map((id) => {
                  const person = localPeopleMap[id] ?? auditPeople.find((p) => p.id === id);
                  if (!person) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                    >
                      <PersonAvatar name={person.name} src={person.image} size="sm" />
                      {person.name}
                      <button
                        type="button"
                        onClick={() => !isReadOnly && setSelectedAssignees((prev) => prev.filter((a) => a !== id))}
                        disabled={isReadOnly}
                        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20 transition-colors disabled:cursor-not-allowed"
                        aria-label={`Remove ${person.name}`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search input */}
            {!isReadOnly && (
            <div className="relative print:hidden">
              <input
                type="text"
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                placeholder="Search people…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pl-9 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-100"
              />
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            )}

            {/* AD search dropdown */}
            {assigneeSearch.trim().length >= 2 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-md">
                {adSearching ? (
                  <p className="px-4 py-3 text-sm text-slate-400">Searching...</p>
                ) : adResults.filter((p) => !selectedAssignees.includes(p.id)).length > 0 ? (
                  adResults
                    .filter((p) => !selectedAssignees.includes(p.id))
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedAssignees((prev) => [...prev, p.id]);
                          setLocalPeopleMap((prev) => ({ ...prev, [p.id]: { id: p.id, name: p.name ?? "", email: p.email, image: p.image ?? null } }));
                          setAssigneeSearch("");
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <PersonAvatar name={p.name ?? ""} src={p.image ?? null} size="md" />
                        {p.name}
                      </button>
                    ))
                ) : (
                  <p className="px-4 py-3 text-sm text-slate-400">No results found.</p>
                )}
              </div>
            )}

            {!assignState.ok && assignState.error ? (
              <p className="mt-3 text-sm text-red-600">{assignState.error}</p>
            ) : null}

            {!isReadOnly && (
            <div className="mt-4 flex items-center justify-center gap-3 print:hidden">
              <button
                disabled={assignPending}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {assignPending ? "Saving..." : "Save Assignees"}
              </button>
              {assignSaved && (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Saved!
                </span>
              )}
            </div>
            )}
          </form>
        </section>

        {/* Documents */}
        <section id="documents" className="print:hidden mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm scroll-mt-6">
          <h2 className="text-sm font-bold text-slate-900">📎 Documents</h2>

          <div className="mt-4 space-y-2">
            {documents.length ? (
              documents.map((d) => (
                <div 
                  key={d.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <a
                    href={`/api/documents/${d.id}/download`}
                    className="flex-1 text-sm font-semibold text-slate-700 hover:text-blue-600"
                  >
                    📄 {d.filename}
                  </a>
                  {!isReadOnly && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete "${d.filename}"?`)) return;
                      
                      try {
                        const response = await fetch(
                          `/api/requests/${request.id}/documents/${d.id}?auditId=${auditId}`,
                          { method: 'DELETE' }
                        );
                        
                        if (response.ok) {
                          // Remove from UI immediately
                          setDocuments(prev => prev.filter(doc => doc.id !== d.id));
                        } else {
                          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                          console.error('Delete failed:', response.status, errorData);
                          alert(`Failed to delete document: ${errorData.error || response.statusText}`);
                        }
                      } catch (error) {
                        console.error('Delete error:', error);
                        alert(`Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`);
                      }
                    }}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete document"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No documents uploaded yet.</p>
            )}
          </div>

          {/* Upload */}
          {!isReadOnly && (
            <div className="mt-4 print:hidden">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Upload documents…</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    e.target.value = "";
                    const fd = new FormData();
                    fd.append("auditId", auditId);
                    files.forEach((f) => fd.append("files", f));
                    try {
                      const res = await fetch(`/api/requests/${request.id}/documents`, { method: "POST", body: fd });
                      if (res.ok) {
                        const data = (await res.json()) as { documents: { id: string; filename: string; url: string }[] };
                        setDocuments((prev) => [...prev, ...data.documents]);
                      } else {
                        const err = (await res.json()) as { error?: string };
                        alert(err.error ?? "Upload failed");
                      }
                    } catch {
                      alert("Upload failed. Please try again.");
                    }
                  }}
                />
              </label>
            </div>
          )}
        </section>
        {/* Notes Pad */}
        <section className="print:hidden mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">📝 Notes</h2>
            {noteLastEditor && noteLastSaved && (
              <span className="text-[10px] text-slate-400">
                Last edited by {noteLastEditor} · {new Date(noteLastSaved).toLocaleString()}
              </span>
            )}
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            readOnly={isReadOnly}
            placeholder={isReadOnly ? "No notes." : "Write shared notes here… Everyone can edit."}
            rows={5}
            className={`mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 resize-y ${isReadOnly ? "bg-slate-50 text-slate-500 cursor-default" : ""}`}
          />
          <div className="mt-2 flex items-center justify-center gap-2 print:hidden">
            {noteSaving && <span className="text-xs text-slate-400">Saving…</span>}
            {!isReadOnly && (
            <button
              type="button"
              disabled={noteSaving}
              onClick={async () => {
                setNoteSaving(true);
                const result = await saveRequestNote(request.id, auditId, noteText);
                setNoteSaving(false);
                if (result.ok) {
                  setNoteLastSaved(new Date().toISOString());
                  setNoteLastEditor("You");
                }
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Save Note
            </button>
            )}
          </div>
        </section>

        {/* Comments */}
        <section id="comments" className="print:hidden mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm scroll-mt-6">
          <h2 className="text-sm font-bold text-slate-900">💬 Comments</h2>
          <div className="mt-4 space-y-3">
            {liveComments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-200">
                  {comment.authorImage ? (
                    <img src={comment.authorImage} alt={comment.authorName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-white">
                      {getInitials(comment.authorName)}
                    </span>
                  )}
                </span>
                <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{comment.authorName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span>
                      {comment.authorId === currentUserId && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Delete this comment?")) return;
                          const result = await deleteRequestComment(comment.id, request.id, auditId);
                          if (!result.ok) alert(result.error);
                          else {
                            setLiveComments((prev) => prev.filter((c) => c.id !== comment.id));
                          }
                        }}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Delete comment"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{renderMentionText(comment.text, auditPeople)}</p>
                </div>
              </div>
            ))}
            {liveComments.length === 0 && <p className="text-sm text-slate-400">No comments yet.</p>}
          </div>
          {!isReadOnly && (
          <form
            className="mt-4 flex items-center gap-2 print:hidden"
            onSubmit={async (e) => {
              e.preventDefault();
              const text = commentText.trim();
              if (!text || commentSending) return;
              setCommentSending(true);
              try {
                const result = await addRequestComment(request.id, auditId, text);
                if (result.ok) {
                  setCommentText("");
                  setCommentSending(false);
                  // Fetch fresh comments immediately
                  try {
                    const res = await fetch(`/api/requests/${request.id}/comments-notes`);
                    if (res.ok) {
                      const data = await res.json() as { comments: typeof comments; note: { text: string; lastEditedBy: string | null; lastEditedAt: string | null } };
                      setLiveComments(data.comments);
                    }
                  } catch { /* will catch on next poll */ }
                } else {
                  alert(result.error);
                  setCommentSending(false);
                }
              } catch {
                alert("Failed to save comment. Please try again.");
                setCommentSending(false);
              }
            }}
          >
            {currentUserImage ? (
              <img src={currentUserImage} alt={currentUserName} className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-slate-200" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white ring-2 ring-slate-200">
                {getInitials(currentUserName)}
              </div>
            )}
            <MentionTextarea
              people={auditPeople}
              value={commentText}
              onChange={setCommentText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).form?.requestSubmit();
                }
              }}
              placeholder="Write a comment... Use @ to mention people"
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 resize-none"
            />
            <button
              type="submit"
              disabled={commentSending}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition-all"
            >
              {commentSending ? (
                <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : "Comment"}
            </button>
          </form>
          )}
        </section>
      </div>
    </main>
  );
}