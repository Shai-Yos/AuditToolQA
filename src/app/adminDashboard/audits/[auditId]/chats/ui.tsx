"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback, useSyncExternalStore, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuditNav, useAuditStreamEvent } from "@/components/audit-nav-context";
import { NewRequestModal } from "@/components/new-request-modal";

const TranscriptionEditor = dynamic(
  () => import("@/components/transcription-editor").then((m) => m.TranscriptionEditor),
  { ssr: false },
);

import { FrRequestsStrip } from "@/components/fr-requests-strip";

// Single SSE connection shared across all ChatPanel instances on the same page.
// Each event is tagged with a monotonic `seq` so the object reference always
// changes, even when consecutive events share the same `data` string (e.g.
// several "chat" events in a row) — otherwise React bails the state update
// (Object.is same-value check) and downstream effects never re-fire.
const AuditStreamContext = createContext<{ data: string; seq: number }>({ data: "", seq: 0 });

type Message = {
  id: string;
  _key?: string;
  isNew?: boolean;
  authorName: string;
  authorImage?: string | null;
  authorRole?: string;
  time: string;
  text: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileSize?: number | null;
  editedAt?: string | null;
  replyTo?: { id: string; authorName: string; text: string } | null;
};

const MAX_CHARS = 2000;

function initials(name: string) {
  const local = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  const cleaned = local.replace(/\(.*?\)/g, "").trim();
  const parts = cleaned.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return (
    ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?"
  );
}

// Renders a message author's avatar image, falling back to initials if the
// image fails to load (e.g. /api/user/photo returns 404 because the user has
// no stored photo yet).
function MessageAvatarImg({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{initials(name)}</>;
  return (
    <img
      src={src}
      alt={name}
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/** Returns "Today", "Yesterday", or formatted date */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const dKey = d.toISOString().slice(0, 10);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dKey === todayKey) return "Today";
  if (dKey === yesterdayKey) return "Yesterday";
  return `${d.toLocaleString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} UTC`;
}

function isSameDay(a: string, b: string) {
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

type StatusBannerItem = { id: string; name: string; color: string; count: number };

export default function ChatsUI({
  auditId,
  auditTitle,
  frontRoomsCount,
  chatChannels,
  transcriptionFrIndices,
  frToBrMap,
  statusBanner,
  totalRequests,
  currentUser,
  roomUsers,
}: {
  auditId: string;
  auditTitle: string;
  frontRoomsCount: number;
  chatChannels: Record<string, Message[]>;
  transcriptionFrIndices: number[];
  frToBrMap: Record<number, number[]>;
  statusBanner: StatusBannerItem[];
  totalRequests: number;
  currentUser: { id: string; name: string; isAdmin: boolean };
  roomUsers?: { id: string; name: string; image?: string | null }[];
}) {
  const router = useRouter();
  const { setActiveAudit } = useAuditNav();
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState<string | null>(null);
  const [prefillFrIndex, setPrefillFrIndex] = useState<number | null>(null);

  // Channel order — persisted per audit in localStorage
  const orderKey = `chat-order-${auditId}`;
  const subscribeOrder = useCallback((cb: () => void) => {
    const handler = (e: StorageEvent) => { if (e.key === orderKey) cb(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [orderKey]);
  const getOrder = useCallback(() => localStorage.getItem(orderKey) ?? "[]", [orderKey]);
  const orderSnapshot = useSyncExternalStore(subscribeOrder, getOrder, () => "[]");
  const savedOrder: string[] = (() => { try { return JSON.parse(orderSnapshot) as string[]; } catch { return []; } })();
  const setOrder = useCallback((updater: (prev: string[]) => string[]) => {
    const raw = localStorage.getItem(orderKey) ?? "[]";
    let prev: string[] = [];
    try { prev = JSON.parse(raw) as string[]; } catch { /* ignore */ }
    const next = updater(prev);
    localStorage.setItem(orderKey, JSON.stringify(next));
    window.dispatchEvent(Object.assign(new Event("storage"), { key: orderKey }) as StorageEvent);
  }, [orderKey]);

  // Drag-and-drop reorder for chat panels
  const [editingOrder, setEditingOrder] = useState(false);
  const dragIdxRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const handleDragStart = useCallback((idx: number) => { dragIdxRef.current = idx; }, []);
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); }, []);
  const handleDrop = useCallback((targetIdx: number, channels: string[]) => {
    const from = dragIdxRef.current;
    if (from === null || from === targetIdx) { dragIdxRef.current = null; setDragOverIdx(null); return; }
    const reordered = [...channels];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIdx, 0, moved!);
    setOrder(() => reordered);
    dragIdxRef.current = null;
    setDragOverIdx(null);
  }, [setOrder]);
  const handleDragEnd = useCallback(() => { dragIdxRef.current = null; setDragOverIdx(null); }, []);

  const [liveTitle, setLiveTitle] = useState(auditTitle);
  const [liveFrontRoomsCount, setLiveFrontRoomsCount] = useState(frontRoomsCount);
  const [liveStatusBanner, setLiveStatusBanner] = useState(statusBanner);
  const [liveTotalRequests, setLiveTotalRequests] = useState(totalRequests);

  useEffect(() => {
    setActiveAudit({ id: auditId, title: liveTitle, tab: "chat" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, liveTitle]);

  useEffect(() => {
    return () => setActiveAudit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [streamEvent, setStreamEvent] = useState({ data: "", seq: 0 });

  const fetchMeta = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits/${auditId}/meta`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        title: string;
        frontRoomsCount: number;
        statusBanner: StatusBannerItem[];
        totalRequests: number;
      };
      setLiveTitle(data.title);
      setLiveFrontRoomsCount(data.frontRoomsCount);
      setLiveStatusBanner(data.statusBanner);
      setLiveTotalRequests(data.totalRequests);
    } catch { /* ignore */ }
  }, [auditId]);

  // Shared connection (via AuditNavProvider) — events forwarded to ChatPanels via context
  useAuditStreamEvent(
    useCallback(
      (data: string) => {
        setStreamEvent((prev) => ({ data, seq: prev.seq + 1 }));
        if (data === "meta" || data === "requests" || data === "kanban") void fetchMeta();
      },
      [fetchMeta],
    ),
  );

  useEffect(() => {
    const id = setInterval(() => void fetchMeta(), 60_000);
    return () => clearInterval(id);
  }, [fetchMeta]);

  return (
    <AuditStreamContext.Provider value={streamEvent}>
    <main className="min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-50 via-cyan-50/30 to-transparent" />

      <div className="relative mx-auto w-full max-w-none px-4 sm:px-6 xl:px-10 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="w-full text-center flex flex-col items-center">
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl w-full max-w-4xl break-words">
              {liveTitle}
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
            <button
              type="button"
              onClick={() => setShowNewRequestModal(true)}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              + New Request
            </button>
          </div>
        </div>

        {/* Status banner */}
        <div className="mb-6 flex flex-wrap gap-3 justify-center">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</span>
            <span className="text-sm font-bold text-slate-900">{liveTotalRequests}</span>
          </div>
          {liveStatusBanner.map((col) => (
            <div key={col.id} className="flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 shadow-sm" style={{ borderColor: col.color + "55" }}>
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
              <span className="text-xs font-semibold text-slate-600">{col.name}</span>
              <span className="text-sm font-bold" style={{ color: col.color }}>{col.count}</span>
            </div>
          ))}
        </div>

        {/* Chat panels */}
        <div className="space-y-6">
          {(() => {
            // Build default channel list: only comm for FRs with BR connections, transcription for all
            const defaultChannels: string[] = [];
            for (let i = 1; i <= liveFrontRoomsCount; i++) {
              if ((frToBrMap[i]?.length ?? 0) > 0) {
                defaultChannels.push(`fr${i}-comm`);
              }
              defaultChannels.push(`fr${i}-transcription`);
            }
            const validSet = new Set(defaultChannels);
            // Apply saved order: put saved channels first (if still valid), then any new ones
            const ordered = savedOrder.filter((ch) => validSet.has(ch));
            const orderedSet = new Set(ordered);
            for (const ch of defaultChannels) {
              if (!orderedSet.has(ch)) ordered.push(ch);
            }

            const isCustomOrder = JSON.stringify(ordered) !== JSON.stringify(defaultChannels);

            return (
              <>
                <div className="flex justify-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setEditingOrder((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                      editingOrder
                        ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
                    </svg>
                    {editingOrder ? "Done" : "Edit Order"}
                  </button>
                  {isCustomOrder && editingOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem(orderKey);
                        window.dispatchEvent(Object.assign(new Event("storage"), { key: orderKey }) as StorageEvent);
                        setEditingOrder(false);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm-10.624-2.85a5.5 5.5 0 0 1 9.201-2.465l.312.31H11.77a.75.75 0 0 0 0 1.5h3.634a.75.75 0 0 0 .75-.75V3.535a.75.75 0 0 0-1.5 0v2.033l-.312-.311A7 7 0 0 0 2.63 8.396a.75.75 0 0 0 1.45.39l-.001-.013Z" clipRule="evenodd" />
                      </svg>
                      Default Order
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-6 min-[1200px]:grid-cols-2">
                {ordered.map((ch, idx) => {
                  const commMatch = /^fr(\d+)-comm$/.exec(ch);
                  const transcMatch = /^fr(\d+)-transcription$/.exec(ch);
                  const frNum = parseInt((commMatch?.[1] ?? transcMatch?.[1])!, 10);
                  const connectedBrs = frToBrMap[frNum] ?? [];

                  let panel: React.ReactNode;
                  if (commMatch) {
                    const commTitle = connectedBrs.length > 0
                      ? `FR${frNum} ↔ ${connectedBrs.map((b) => `BR${b}`).join(" & ")} Communication`
                      : `FR${frNum} ↔ BR Communication`;
                    panel = (
                      <ChatPanel
                        auditId={auditId}
                        channel={ch}
                        title={commTitle}
                        badge={`Room ${frNum}`}
                        initialMessages={chatChannels[ch] ?? []}
                        composerPlaceholder="Type a message..."
                        currentUserName={currentUser.name}
                        roomUsers={roomUsers}
                        frIndex={frNum}
                        onCreateRequest={(text, frIdx) => { setPrefillTitle(text); setPrefillFrIndex(frIdx ?? null); setShowNewRequestModal(true); }}
                        onPopOut={() => window.open(
                          `/adminDashboard/audits/${encodeURIComponent(auditId)}/chats/popout?channel=${encodeURIComponent(ch)}`,
                          "_blank"
                        )}
                      />
                    );
                  } else {
                    const canTranscribe = currentUser.isAdmin || transcriptionFrIndices.includes(frNum);
                    panel = canTranscribe ? (
                      <ChatPanel
                        auditId={auditId}
                        channel={ch}
                        title={`FR${frNum} Transcription`}
                        badge={`FR ${frNum}`}
                        initialMessages={chatChannels[ch] ?? []}
                        composerPlaceholder="Enter transcription..."
                        currentUserName={currentUser.name}
                        allowTranscriptionExport={currentUser.isAdmin}
                        roomUsers={roomUsers}
                        rightPanel
                        frIndex={frNum}
                        onCreateRequest={(text, frIdx) => { setPrefillTitle(text); setPrefillFrIndex(frIdx ?? null); setShowNewRequestModal(true); }}
                        onPopOut={() => window.open(
                          `/adminDashboard/audits/${encodeURIComponent(auditId)}/chats/popout?channel=${encodeURIComponent(ch)}`,
                          "_blank"
                        )}
                      />
                    ) : (
                      <LockedPanel title={`FR${frNum} Transcription`} badge={`FR ${frNum}`} />
                    );
                  }

                  return (
                    <div
                      key={ch}
                      draggable={editingOrder}
                      onDragStart={editingOrder ? () => handleDragStart(idx) : undefined}
                      onDragOver={editingOrder ? (e) => handleDragOver(e, idx) : undefined}
                      onDrop={editingOrder ? () => handleDrop(idx, ordered) : undefined}
                      onDragEnd={editingOrder ? handleDragEnd : undefined}
                      className={[
                        "transition-opacity",
                        editingOrder ? "animate-wiggle cursor-grab" : "",
                        dragOverIdx === idx ? "ring-2 ring-blue-400 ring-offset-2 rounded-2xl" : "",
                      ].join(" ")}
                    >
                      {panel}
                    </div>
                  );
                })}
              </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* New Request Modal */}
      {showNewRequestModal && (
        <NewRequestModal
          auditId={auditId}
          auditTitle={liveTitle}
          frontRoomsCount={liveFrontRoomsCount}
          prefillTitle={prefillTitle ?? undefined}
          prefillFrIndex={prefillFrIndex ?? undefined}
          onClose={() => { setShowNewRequestModal(false); setPrefillTitle(null); setPrefillFrIndex(null); }}
          onRequestCreated={() => router.refresh()}
        />
      )}
    </main>
    </AuditStreamContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// FileBubble — renders a file attachment message
// ---------------------------------------------------------------------------

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string | null | undefined): { type: "emoji"; value: string } | { type: "img"; src: string; alt: string } {
  if (!mime) return { type: "emoji", value: "📄" };
  if (mime.startsWith("image/")) return { type: "emoji", value: "🖼️" };
  if (mime === "application/pdf") return { type: "emoji", value: "📕" };
  if (mime.includes("word")) return { type: "img", src: "/word.png", alt: "Word" };
  if (mime.includes("excel") || mime.includes("spreadsheet") || mime === "text/csv") return { type: "img", src: "/excel.png", alt: "Excel" };
  if (mime.includes("powerpoint") || mime.includes("presentation")) return { type: "img", src: "/powerpoint.png", alt: "PowerPoint" };
  return { type: "emoji", value: "📄" };
}

function FileIconNode({ mime }: { mime: string | null | undefined }) {
  const icon = fileIcon(mime);
  if (icon.type === "img") return <img src={icon.src} alt={icon.alt} className="h-7 w-7 shrink-0 object-contain" />;
  return <span className="text-2xl shrink-0">{icon.value}</span>;
}

function FileBubble({ m, isOwn }: { m: Message; isOwn: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 max-w-[280px]">
      <a
        href={m.fileUrl ?? "#"}
        download={m.fileName ?? true}
        className={[
          "flex items-center gap-3 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm border transition hover:brightness-95",
          isOwn
            ? "bg-blue-50 border-blue-200 text-blue-900"
            : "bg-white border-slate-200 text-slate-800",
          m.isNew ? "animate-[fadeSlideIn_0.3s_ease-out]" : "",
        ].join(" ")}
      >
        <FileIconNode mime={m.fileMime} />
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold truncate">{m.fileName ?? m.text}</span>
          {m.fileSize != null && (
            <span className="text-[11px] text-slate-400">{formatBytes(m.fileSize)}</span>
          )}
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400 ml-auto">
          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
      </a>
      {m.text && (
        <p className={[
          "text-sm px-3.5 py-1.5 rounded-2xl rounded-tl-sm shadow-sm break-words whitespace-pre-wrap leading-relaxed",
          isOwn ? "bg-blue-50 text-slate-800 border border-blue-200" : "bg-white text-slate-800 border border-slate-200",
        ].join(" ")}>
          {m.text}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LockedPanel
// ---------------------------------------------------------------------------

function LockedPanel({ title, badge, message }: { title: string; badge: string; message?: string }) {
  const mainMessage = message ?? "Transcription access required";
  const subMessage = message
    ? "Contact your audit administrator to be assigned to this audit."
    : "Only users assigned the Transcription role for this room can view or write here.";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col h-[520px] sm:h-[640px]">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 ring-1 ring-slate-200">{badge}</span>
              <span className="text-slate-300">•</span>
              <span>Transcription</span>
            </div>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-400 shadow-sm">
          Restricted
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200 text-2xl opacity-50">
          🔒
        </div>
        <p className="text-sm font-semibold text-slate-500">{mainMessage}</p>
        <p className="max-w-[260px] text-xs text-slate-400 leading-relaxed">{subMessage}</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel({
  auditId,
  channel,
  title,
  badge,
  initialMessages,
  composerPlaceholder,
  currentUserName,
  allowTranscriptionExport,
  rightPanel,
  frIndex,
  onCreateRequest,
  onPopOut,
  popout,
  roomUsers,
}: {
  auditId: string;
  channel: string;
  title: string;
  badge: string;
  initialMessages: Message[];
  composerPlaceholder: string;
  currentUserName: string;
  allowTranscriptionExport?: boolean;
  rightPanel?: boolean;
  frIndex?: number;
  onCreateRequest?: (text: string, frIndex?: number) => void;
  onPopOut?: () => void;
  popout?: boolean;
  roomUsers?: { id: string; name: string; image?: string | null }[];
}) {
  const latestInitialTranscription = rightPanel ? initialMessages.at(-1) ?? null : null;
  const [messages, setMessages] = useState<Message[]>(
    initialMessages.map((m) => ({ ...m, _key: crypto.randomUUID() })),
  );
  const [text, setText] = useState(rightPanel ? latestInitialTranscription?.text ?? "" : "");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState<number>(-1);
  const mentionedUsersRef = useRef(new Map<string, string>());
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [liveStatus, setLiveStatus] = useState<"live" | "error">("live");
  const liveStatusRef = useRef<"live" | "error">("live");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    messageId: string; x: number; y: number; text: string; isOwn: boolean; authorName: string;
  } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [exportingTranscription, setExportingTranscription] = useState(false);
  const [exportStatusText, setExportStatusText] = useState<string | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ id: string; authorName: string; text: string } | null>(null);

  useEffect(() => {
    if (!exportStatusText) return;
    const id = setTimeout(() => setExportStatusText(null), 4000);
    return () => clearTimeout(id);
  }, [exportStatusText]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const transcriptionScrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef<string | null>(initialMessages.at(-1)?.time ?? null);
  const mountedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savedMsgIdsRef = useRef<string[]>(rightPanel && latestInitialTranscription ? [latestInitialTranscription.id] : []);
  const savedContentRef = useRef<string>(rightPanel ? latestInitialTranscription?.text ?? "" : "");
  const hasUserEditedRef = useRef(false);

  // Auto-resize textarea (chat composer only; notepad uses flex)
  useEffect(() => {
    if (rightPanel) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [text, rightPanel]);

  // Typing indicator — report only (poll replaced by SSE-triggered fetch)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportTyping = useCallback(() => {
    if (typingTimeoutRef.current) return; // throttle: max once per 2s
    fetch(`/api/audits/${auditId}/chat/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    }).catch(() => {});
    typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000);
  }, [auditId, channel]);

  const fetchTyping = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits/${auditId}/chat/typing?channel=${encodeURIComponent(channel)}`);
      if (!res.ok) return;
      const names = (await res.json()) as string[];
      setTypingNames(names);
    } catch { /* ignore */ }
  }, [auditId, channel]);

  const exportNow = useCallback(async () => {
    if (!rightPanel || exportingTranscription) return;
    setExportingTranscription(true);
    setExportStatusText(null);
    try {
      const res = await fetch(`/api/audits/${auditId}/transcription/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, force: true }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        status?: string;
        fileName?: string;
        error?: string;
      };
      if (!res.ok) {
        setExportStatusText(payload.error ?? "Export failed");
      } else if (payload.status === "exported") {
        setExportStatusText(`Exported (${payload.fileName ?? "snapshot"})`);
      } else if (payload.status === "skipped") {
        setExportStatusText("No content to export");
      } else {
        setExportStatusText("Export finished");
      }
    } catch {
      setExportStatusText("Export failed");
    } finally {
      setExportingTranscription(false);
    }
  }, [rightPanel, exportingTranscription, auditId, channel]);

  // Keep a ref to the latest text so the interval always reads the current value
  const textRef = useRef(text);
  useEffect(() => { textRef.current = text; }, [text]);

  // Auto-save for transcription mode every 1.5s
const savingRef = useRef(false);

// Treat TipTap's empty output as truly empty
const isEmptyHtml = (html: string) => !html.replace(/<[^>]*>/g, "").trim();

useEffect(() => {
  if (!rightPanel) return;

  const save = async () => {
    const v = textRef.current;

    // Nothing changed (also treat empty TipTap HTML as matching empty savedContent)
    if (v === savedContentRef.current) return;
    if (isEmptyHtml(v) && (!savedContentRef.current || isEmptyHtml(savedContentRef.current))) return;

    // Prevent overlapping saves
    if (savingRef.current) return;

    savingRef.current = true;
    hasUserEditedRef.current = true;
    setSaveStatus("saving");

    try {
      const existingId = savedMsgIdsRef.current[0];

      // If transcription was cleared, delete old saved message
      if (!v.trim() || isEmptyHtml(v)) {
        if (existingId) {
          const res = await fetch(`/api/audits/${auditId}/chat`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messageId: existingId,
              channel,
            }),
          });

          if (!res.ok) {
            const errorText = await res.text();
            console.error("Failed to delete transcription:", {
              status: res.status,
              errorText,
              messageId: existingId,
              channel,
            });

            setSaveStatus("idle");
            return;
          }
        }

        savedMsgIdsRef.current = [];
        savedContentRef.current = "";
        lastTimeRef.current = null;
        setMessages([]);

        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
        return;
      }

      // Update existing transcription message
      if (existingId) {
        const res = await fetch(`/api/audits/${auditId}/chat`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: existingId,
            channel,
            text: v,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error("Failed to update transcription:", {
            status: res.status,
            errorText,
            messageId: existingId,
            channel,
            textLength: v.length,
          });

          setSaveStatus("idle");
          return;
        }

        const data = (await res.json()) as { ok: boolean; message: Message };

        savedMsgIdsRef.current = [data.message.id];
        savedContentRef.current = v;
        lastTimeRef.current = data.message.time;

        setMessages([{ ...data.message, _key: crypto.randomUUID() }]);

        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
        return;
      }

      // Create first transcription message
      const res = await fetch(`/api/audits/${auditId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          text: v,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to create transcription:", "status:", res.status, "error:", errorText, "channel:", channel, "textLength:", v.length);

        setSaveStatus("idle");
        return;
      }

      const data = (await res.json()) as { ok: boolean; message: Message };

      savedMsgIdsRef.current = [data.message.id];
      savedContentRef.current = v;
      lastTimeRef.current = data.message.time;

      setMessages([{ ...data.message, _key: crypto.randomUUID() }]);

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Transcription auto-save crashed:", err);
      setSaveStatus("idle");
    } finally {
      savingRef.current = false;
    }
  };

  const id = setInterval(() => {
    void save();
  }, 1500);

  return () => clearInterval(id);
}, [rightPanel, auditId, channel]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = rightPanel ? transcriptionScrollRef.current : scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom) setUnreadCount(0);
  }, [rightPanel]);

  // Scroll to bottom on mount
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // For transcription panels, always stay pinned to the latest content.
  useEffect(() => {
    if (!rightPanel) return;
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rightPanel, text]);

  // Always scroll to bottom when new messages arrive
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setUnreadCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Incremental fetch — called on SSE "chat" event or visibility change
  const fetchIncremental = useCallback(async () => {
    if (document.hidden) return;
    try {
      const after = lastTimeRef.current
        ? `&after=${encodeURIComponent(lastTimeRef.current)}`
        : "";
      const res = await fetch(
        `/api/audits/${auditId}/chat?channel=${encodeURIComponent(channel)}${after}`,
        { cache: "no-store" },
      );
      if (!res.ok) { liveStatusRef.current = "error"; setLiveStatus("error"); return; }
      liveStatusRef.current = "live"; setLiveStatus("live");
      const newMsgs = (await res.json()) as Message[];
      if (newMsgs.length > 0) {
        if (rightPanel && !savingRef.current && textRef.current === savedContentRef.current) {
          const latest = newMsgs.at(-1)!;
          setText(latest.text);
          savedContentRef.current = latest.text;
          savedMsgIdsRef.current = [latest.id];
        }
        setMessages((prev) => {
          const existingMap = new Map(prev.map((m) => [m.id, m]));
          let updated = false;
          const freshList: (Message & { _key?: string; isNew?: boolean })[] = [];

          for (const m of newMsgs) {
            const existing = existingMap.get(m.id);
            if (existing) {
              if (m.editedAt && m.editedAt !== existing.editedAt) {
                existingMap.set(m.id, { ...existing, text: m.text, editedAt: m.editedAt });
                updated = true;
              }
            } else if (!m.id.startsWith("temp-")) {
              freshList.push({ ...m, _key: crypto.randomUUID(), isNew: true });
            }
          }

          if (freshList.length > 0) {
            lastTimeRef.current = newMsgs.at(-1)!.time;
            if (!isAtBottom) setUnreadCount((c) => c + freshList.length);
            setTimeout(() => {
              setMessages((prev2) =>
                prev2.map((m) => (m.isNew ? { ...m, isNew: false } : m)),
              );
            }, 1200);
          }

          if (!updated && freshList.length === 0) return prev;
          const merged = prev.map((m) => existingMap.get(m.id) ?? m);
          return [...merged, ...freshList];
        });
      }
    } catch { liveStatusRef.current = "error"; setLiveStatus("error"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, channel, rightPanel]);

  // Full sync — called every 60s as a safety net for missed events (deletes, edits)
  const fullSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doFullSync = useCallback(async () => {
    if (document.hidden) return;
    // Skip when SSE is healthy — incremental updates cover everything
    if (liveStatusRef.current === "live") return;
    try {
      const res = await fetch(
        `/api/audits/${auditId}/chat?channel=${encodeURIComponent(channel)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const allMsgs = (await res.json()) as Message[];
      if (rightPanel && !savingRef.current && textRef.current === savedContentRef.current) {
        const latest = allMsgs.at(-1);
        const nextText = latest?.text ?? "";
        setText(nextText);
        savedContentRef.current = nextText;
        savedMsgIdsRef.current = latest ? [latest.id] : [];
      }
      setMessages((prev) => {
        const keyMap = new Map(prev.map((m) => [m.id, m._key]));
        const temps = prev.filter((m) => m.id.startsWith("temp-"));
        return [...allMsgs.map((m) => ({ ...m, _key: keyMap.get(m.id) ?? crypto.randomUUID() })), ...temps];
      });
      if (allMsgs.length > 0) lastTimeRef.current = allMsgs.at(-1)!.time;
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, channel]);

  // Receive SSE events forwarded from the parent ChatsUI via context (single shared connection)
  const streamEvent = useContext(AuditStreamContext);
  useEffect(() => {
    if (!streamEvent.data || streamEvent.data === "connected") return;
    if (streamEvent.data === "chat") void fetchIncremental();
    if (streamEvent.data === "typing") void fetchTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamEvent]);

  // Visibility change: re-fetch on tab focus
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) void fetchIncremental(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 60s full-sync fallback
  useEffect(() => {
    fullSyncRef.current = setInterval(() => void doFullSync(), 60_000);
    return () => { if (fullSyncRef.current) clearInterval(fullSyncRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, channel, rightPanel]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPendingFile(file);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const doFileUpload = async (file: File, caption: string) => {
    setUploading(true);
    setPendingFile(null);
    setText("");
    fetch(`/api/audits/${auditId}/chat/typing`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    }).catch(() => {});
    try {
      const fd = new FormData();
      fd.append("channel", channel);
      fd.append("file", file);
      fd.append("fileName", file.name);
      fd.append("caption", caption);
      const res = await fetch(`/api/audits/${auditId}/chat/upload`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; message: Message };
        lastTimeRef.current = data.message.time;
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id)
            ? prev
            : [...prev, { ...data.message, _key: crypto.randomUUID() }],
        );
        setTimeout(() => {
          const el = scrollContainerRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        }, 50);
      } else {
        const err = (await res.json()) as { error?: string };
        alert(err.error ?? "Upload failed");
      }
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      textareaRef.current?.focus();
    }
  };

  const startEdit = (messageId: string, currentText: string) => {
    setContextMenu(null);
    setEditingId(messageId);
    setEditText(currentText);
    setTimeout(() => editTextareaRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleEditSave = async () => {
    if (!editingId || !editText.trim() || editSaving) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/chat`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: editingId, text: editText.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; message: Message };
        setMessages((prev) =>
          prev.map((m) => m.id === editingId ? { ...m, text: data.message.text, editedAt: data.message.editedAt ?? new Date().toISOString() } : m),
        );
      }
    } catch { /* ignore */ } finally {
      setEditSaving(false);
      setEditingId(null);
      setEditText("");
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    setContextMenu(null);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await fetch(`/api/audits/${auditId}/chat`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
    } catch { /* ignore */ }
  };

  const mentionSuggestions = mentionQuery !== null && roomUsers
    ? roomUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery)).slice(0, 10)
    : [];

  const selectMention = (user: { id: string; name: string }) => {
    const before = text.slice(0, mentionAnchor);
    const after = text.slice(mentionAnchor + 1 + (mentionQuery?.length ?? 0));
    setText(`${before}@${user.name} ${after}`);
    mentionedUsersRef.current.set(user.name, user.id);
    setMentionQuery(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSend = async () => {
    if (pendingFile) {
      await doFileUpload(pendingFile, text.trim());
      return;
    }
    const v = text.trim();
    if (!v || sending || v.length > MAX_CHARS) return;
    setSending(true);
    setText("");
    setMentionQuery(null);
    const currentReply = replyingTo;
    setReplyingTo(null);

    // Collect mentioned user IDs from text
    const mentionedUserIds: string[] = [];
    for (const [name, id] of mentionedUsersRef.current.entries()) {
      if (v.includes(`@${name}`)) mentionedUserIds.push(id);
    }
    fetch(`/api/audits/${auditId}/chat/typing`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    }).catch(() => {});

    // Optimistic: show the message immediately
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: tempId,
      _key: tempId,
      authorName: currentUserName,
      authorImage: "/api/user/photo",
      time: new Date().toISOString(),
      text: v,
      ...(currentReply ? { replyTo: currentReply } : {}),
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);

    try {
      const res = await fetch(`/api/audits/${auditId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, text: v, ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}), ...(currentReply ? { replyToId: currentReply.id, replyToAuthorName: currentReply.authorName, replyToText: currentReply.text } : {}) }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; message: Message };
        lastTimeRef.current = data.message.time;
        // Replace optimistic message with the real one
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...data.message, _key: tempId } : m),
        );
      } else {
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const copyText = (t: string) => {
    void navigator.clipboard.writeText(t);
    setContextMenu(null);
  };

  const timeLabel = (iso: string) =>
    `${new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    })} UTC`;

  const charsLeft = MAX_CHARS - text.length;
  const overLimit = charsLeft < 0;
  const nearLimit = charsLeft >= 0 && charsLeft <= 200;

  // Build rows with date separators
  type RowSep = { type: "separator"; label: string; key: string };
  type RowMsg = { type: "message"; msg: Message };
  type Row = RowSep | RowMsg;

  const rows: Row[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const prev = messages[i - 1];
    if (!prev || !isSameDay(prev.time, m.time)) {
      rows.push({ type: "separator", label: dayLabel(m.time), key: `sep-${m.time}` });
    }
    rows.push({ type: "message", msg: m });
  }

  return (
    <section className={popout ? "flex flex-col flex-1 overflow-hidden" : "rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[28rem] h-[68dvh]"}>
      {/* Header */}
      <div className={`flex items-center justify-between border-b ${popout ? "px-8" : "px-5"} py-4 shrink-0 ${rightPanel ? "border-amber-200 bg-amber-50/60" : "border-blue-200 bg-blue-50/60"}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className={`truncate text-sm lg:text-base font-semibold ${rightPanel ? "text-amber-900" : "text-blue-900"}`}>{title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs lg:text-sm text-slate-500">
              <span className={`rounded-full px-2 py-0.5 ring-1 ${rightPanel ? "bg-amber-100 ring-amber-200 text-amber-700" : "bg-blue-100 ring-blue-200 text-blue-700"}`}>
                {badge}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <span className="flex items-center gap-1.5">
            <span
              className={[
                "h-1.5 w-1.5 rounded-full",
                liveStatus === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400",
              ].join(" ")}
            />
            <span className="hidden sm:inline text-[10px] lg:text-xs font-medium text-slate-400 uppercase tracking-wide">
              {liveStatus === "live" ? "Live" : "Reconnecting"}
            </span>
          </span>
          <span className={`hidden sm:inline rounded-full border px-3 py-1 text-xs lg:text-sm font-semibold shadow-sm ${rightPanel ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
            {rightPanel ? "Transcription" : "Chat"}
          </span>
          {rightPanel && allowTranscriptionExport && (
            <button
              type="button"
              onClick={() => void exportNow()}
              disabled={exportingTranscription}
              className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-900 shadow-sm transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              title="Create a timestamped transcription snapshot"
            >
              {exportingTranscription ? "Exporting..." : "Export Now"}
            </button>
          )}
          {onPopOut && !popout && (
            <button
              type="button"
              title="Open in popup"
              onClick={onPopOut}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm hover:border-slate-300 hover:text-slate-700 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {rightPanel && exportStatusText && (
        <div className="border-b border-amber-100 bg-amber-50/40 px-5 py-1.5 text-[11px] text-amber-700">
          {exportStatusText}
        </div>
      )}

      {/* Messages area */}
      <div className={popout ? "relative flex flex-col flex-1 min-h-0" : "relative flex-1 min-h-0 flex flex-col"}>
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={[popout ? "flex-1 min-h-0" : "flex-1 min-h-0", "overflow-auto bg-white", rightPanel ? "flex flex-col" : popout ? "px-8 py-4" : "px-4 py-4"].join(" ")}
          onClick={() => { setContextMenu(null); }}
        >
          {rightPanel ? (
            /* ---- Rich-text transcription notepad ---- */
            <>
            {frIndex !== undefined && (
              <FrRequestsStrip auditId={auditId} frIndex={frIndex} />
            )}
            <TranscriptionEditor
              content={text}
              onUpdate={(html) => { setText(html); reportTyping(); }}
              currentAuthor={currentUserName}
              scrollRef={transcriptionScrollRef}
              onScroll={handleScroll}
              onExternalUpdate={() => {
                const el = transcriptionScrollRef.current;
                if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
              }}
              onRequestShortcut={(title) => onCreateRequest?.(title, frIndex)}
              stampStorageKey={channel}
            />
            {typingNames.length > 0 && (
            <div className="absolute top-1 left-0 right-0 flex justify-center pointer-events-none z-10">
              <span className="text-[11px] lg:text-xs font-medium px-3 py-1 rounded-full bg-amber-100/90 text-amber-700 backdrop-blur-sm shadow-sm border border-amber-200 animate-pulse">
                ✏️ {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} editing…
              </span>
            </div>
            )}
            <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none z-10">
              <span className={`text-[10px] lg:text-xs font-medium px-2 py-0.5 rounded-full bg-white/80 backdrop-blur-sm shadow-sm pointer-events-auto ${
                saveStatus === "saving" ? "text-amber-500"
                  : saveStatus === "saved" ? "text-emerald-500"
                  : hasUserEditedRef.current && text !== savedContentRef.current ? "text-slate-400"
                  : "text-emerald-500"
              }`}>
                {saveStatus === "saving" ? "Saving…"
                  : saveStatus === "saved" ? "✓ Saved"
                  : hasUserEditedRef.current && text !== savedContentRef.current ? "● Unsaved"
                  : "✓ Saved"}
              </span>
            </div>
            </>
          ) : (
            /* ---- Chat mode (unchanged) ---- */
            <>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>
              </div>
              <div className="text-sm lg:text-base font-semibold text-slate-600">No messages yet</div>
              <div className="text-xs lg:text-sm text-slate-400">Be the first to send a message.</div>
            </div>
          ) : (
            <div className="space-y-1">
              {rows.map((row) => {
                if (row.type === "separator") {
                  return (
                    <div key={row.key} className="flex items-center gap-3 py-3">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[11px] lg:text-xs font-semibold text-slate-400 uppercase tracking-wider px-2" suppressHydrationWarning>
                        {row.label}
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                  );
                }

                const m = row.msg;
                const isOwn = m.authorName === currentUserName;

                return (
                  <div
                    key={m._key ?? m.id}
                    className={[
                      "group flex gap-2.5 px-1 py-1 rounded-xl transition-colors",
                      hoveredId === m.id ? "bg-slate-100/70" : "",
                    ].join(" ")}
                    onMouseEnter={() => setHoveredId(m.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ messageId: m.id, x: e.clientX, y: e.clientY, text: m.text, isOwn, authorName: m.authorName });
                    }}
                  >
                    {/* Avatar */}
                    <div className={[
                      "h-8 w-8 rounded-full ring-1 flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden mt-0.5",
                      isOwn ? "bg-blue-100 text-blue-700 ring-slate-200" : "bg-slate-100 text-slate-700 ring-slate-200",
                    ].join(" ")}>
                      {m.authorImage ? (
                        <MessageAvatarImg src={m.authorImage} name={m.authorName} />
                      ) : (
                        initials(m.authorName)
                      )}
                    </div>

                    {/* Bubble */}
                    <div className="flex flex-col gap-1 max-w-[78%] items-start">
                      {/* Meta row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={["text-xs lg:text-sm font-semibold", isOwn ? "text-blue-700" : "text-slate-800"].join(" ")}>
                          {isOwn ? "You" : m.authorName}
                        </span>
                        {m.authorRole && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1 text-slate-500 bg-slate-100 ring-slate-200">
                            {m.authorRole}
                          </span>
                        )}
                        <span className="text-[10px] lg:text-xs text-slate-400" suppressHydrationWarning>{timeLabel(m.time)}</span>
                      </div>

                      {/* Message bubble */}
                      {m.replyTo && (
                        <div className="mb-0.5 flex items-start gap-2 rounded-lg border-l-2 border-blue-300 bg-slate-50/80 px-2.5 py-1.5 text-xs lg:text-sm max-w-full">
                          <div className="min-w-0">
                            <span className="font-semibold text-blue-600 block">{m.replyTo.authorName === currentUserName ? "You" : m.replyTo.authorName}</span>
                            <span className="text-slate-400 line-clamp-2 break-all">{m.replyTo.text.replace(/<[^>]*>/g, "").trim() || "📎 File"}</span>
                          </div>
                        </div>
                      )}
                      {editingId === m.id ? (
                        <div className="w-full max-w-[78%]">
                          <textarea
                            ref={editTextareaRef}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleEditSave(); }
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="w-full resize-none rounded-2xl border border-blue-400 bg-blue-50 px-3.5 py-1.5 text-sm lg:text-base text-slate-800 outline-none ring-2 ring-blue-200 leading-relaxed"
                            rows={2}
                          />
                          <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                            <button type="button" onClick={() => void handleEditSave()} disabled={editSaving || !editText.trim()} className="rounded-md bg-blue-600 px-2 py-0.5 text-white font-semibold hover:bg-blue-500 disabled:opacity-40">Save</button>
                            <button type="button" onClick={cancelEdit} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-600 font-semibold hover:bg-slate-50">Cancel</button>
                            <span className="text-slate-400 ml-1">Esc to cancel · Enter to save</span>
                          </div>
                        </div>
                      ) : m.fileUrl ? (
                        <FileBubble m={m} isOwn={isOwn} />
                      ) : (
                        <div
                          className={[
                            "text-sm lg:text-base px-3.5 py-1.5 rounded-2xl rounded-tl-sm shadow-sm break-words whitespace-pre-wrap leading-relaxed",
                            isOwn
                              ? "bg-blue-50 text-slate-800 border border-blue-200"
                              : "bg-white text-slate-800 border border-slate-200",
                            m.isNew ? "animate-[fadeSlideIn_0.3s_ease-out]" : "",
                          ].join(" ")}
                        >
                          {m.text}
                        </div>
                      )}
                      {m.editedAt && editingId !== m.id && (
                        <span className="text-[10px] text-slate-400 italic ml-1">edited</span>
                      )}
                    </div>

                    {/* Hover action buttons */}
                    <div className="flex items-center gap-1 self-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        title="Reply"
                        onClick={() => { setReplyingTo({ id: m.id, authorName: m.authorName, text: m.text }); setTimeout(() => textareaRef.current?.focus(), 0); }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-blue-300 hover:text-blue-600 transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                          <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Create request"
                        onClick={() => { onCreateRequest?.(m.text, frIndex); }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-blue-300 hover:text-blue-600 transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Copy message"
                        onClick={() => copyText(m.text)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-700 transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
                          <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
                        </svg>
                      </button>
                      {isOwn && !m.fileUrl && (
                        <button
                          type="button"
                          title="Edit message"
                          onClick={() => startEdit(m.id, m.text)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-blue-300 hover:text-blue-600 transition"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                          </svg>
                        </button>
                      )}
                      {isOwn && (
                        <button
                          type="button"
                          title="Delete message"
                          onClick={() => void handleDelete(m.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-red-300 hover:text-red-500 transition"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
          </>
          )}

          {/* Right-click context menu */}
          {contextMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
              <div
                className="fixed z-50 min-w-[168px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                style={{ top: contextMenu.y, left: contextMenu.x }}
              >
                <button
                  type="button"
                  onClick={() => { setReplyingTo({ id: contextMenu.messageId, authorName: contextMenu.authorName, text: contextMenu.text }); setContextMenu(null); setTimeout(() => textareaRef.current?.focus(), 0); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                    <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />
                  </svg>
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => { onCreateRequest?.(contextMenu.text, frIndex); setContextMenu(null); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                  </svg>
                  Create request
                </button>
                <button
                  type="button"
                  onClick={() => copyText(contextMenu.text)}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                    <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
                    <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
                  </svg>
                  Copy text
                </button>
                {contextMenu.isOwn && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(contextMenu.messageId, contextMenu.text)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                        <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                      </svg>
                      Edit message
                    </button>
                    <div className="mx-3 h-px bg-slate-100" />
                    <button
                      type="button"
                      onClick={() => void handleDelete(contextMenu.messageId)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                      </svg>
                      Delete message
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Scroll-to-bottom FAB */}
        {!isAtBottom && (
          <button
            type="button"
            onClick={() => {
              const el = rightPanel ? transcriptionScrollRef.current : scrollContainerRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
              setUnreadCount(0);
            }}
            className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md hover:bg-slate-50 transition"
          >
            {unreadCount > 0 && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
            </svg>
            {rightPanel ? "Jump to bottom" : unreadCount > 0 ? "New messages" : "Jump to bottom"}
          </button>
        )}
      </div>

      {/* Typing indicator */}
      {!rightPanel && typingNames.length > 0 && (
        <div className={`flex items-center gap-2 ${popout ? "px-8" : "px-4"} py-1.5 text-xs text-slate-500 bg-white border-t border-slate-100 shrink-0`}>
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
          <span className="font-medium">
            {typingNames.length === 1
              ? `${typingNames[0]} is typing…`
              : typingNames.length === 2
              ? `${typingNames[0]} and ${typingNames[1]} are typing…`
              : `${typingNames[0]} and ${typingNames.length - 1} others are typing…`}
          </span>
        </div>
      )}

      {/* Composer — chat only (transcription has inline textarea) */}
      {!rightPanel && (
      <div className={`border-t border-slate-200 bg-white shrink-0 ${popout ? "px-8 py-3" : "p-3"}`}>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv"
          onChange={handleFileSelect}
        />
        {/* Pending file preview */}
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="w-0.5 self-stretch rounded-full bg-blue-400" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-blue-600 mb-0.5">
                Replying to {replyingTo.authorName === currentUserName ? "yourself" : replyingTo.authorName}
              </p>
              <p className="truncate text-xs text-slate-500">
                {replyingTo.text.replace(/<[^>]*>/g, "").trim() || "📎 File"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
        )}
        {/* Pending file preview */}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 border-blue-200 bg-blue-50">
            <span className="text-lg shrink-0"><FileIconNode mime={pendingFile.type} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-blue-900">{pendingFile.name}</p>
              <p className="text-[10px] text-blue-500">{formatBytes(pendingFile.size)}</p>
            </div>
            <button
              type="button"
              title="Remove file"
              onClick={() => { setPendingFile(null); setText(""); }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition text-blue-400 hover:bg-blue-100 hover:text-blue-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
        )}
        <div
          className={[
            "flex items-center gap-2 rounded-xl border transition focus-within:ring-4",
            overLimit
              ? "border-red-300 bg-red-50 focus-within:border-red-400 focus-within:ring-red-100"
              : pendingFile
              ? "border-blue-300 bg-white focus-within:border-blue-500 focus-within:ring-blue-100"
              : "border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-blue-100",
          ].join(" ")}
        >
          <div className="relative flex-1">
            {/* @mention dropdown */}
            {mentionQuery !== null && mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden">
                {mentionSuggestions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectMention(u); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left"
                  >
                    {u.image ? (
                      <img src={u.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-slate-100" />
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-semibold">
                        {initials(u.name)}
                      </div>
                    )}
                    <span className="text-slate-900 truncate">{u.name}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              onChange={(e) => {
                const val = e.target.value;
                setText(val);
                reportTyping();
                // @mention detection
                const cursor = e.target.selectionStart ?? val.length;
                const before = val.slice(0, cursor);
                const atIdx = before.lastIndexOf("@");
                if (atIdx !== -1) {
                  const partial = before.slice(atIdx + 1);
                  if (!partial.includes(" ") && partial.length <= 30) {
                    setMentionQuery(partial.toLowerCase());
                    setMentionAnchor(atIdx);
                    return;
                  }
                }
                setMentionQuery(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && mentionQuery !== null) {
                  e.preventDefault();
                  setMentionQuery(null);
                  return;
                }
                if (e.key === "Escape" && replyingTo !== null) {
                  e.preventDefault();
                  setReplyingTo(null);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  if (mentionQuery !== null && mentionSuggestions.length > 0) {
                    e.preventDefault();
                    selectMention(mentionSuggestions[0]!);
                    return;
                  }
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={pendingFile ? "Add a caption... (optional)" : composerPlaceholder}
              disabled={sending || uploading}
              className={[
                "w-full resize-none bg-transparent py-3 pl-4 pr-2 text-sm lg:text-base outline-none disabled:opacity-60 overflow-hidden leading-relaxed",
                overLimit ? "text-red-900 placeholder:text-red-400" : "text-slate-900",
              ].join(" ")}
            />
            {(nearLimit || overLimit) && (
              <span className={["absolute bottom-2.5 right-2 text-[10px] font-semibold tabular-nums pointer-events-none", overLimit ? "text-red-500" : "text-amber-500"].join(" ")}>
                {charsLeft}
              </span>
            )}
          </div>
          <button
            type="button"
            title="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-40"
          >
            {uploading ? (
              <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a1.5 1.5 0 0 0 2.122 2.122l7-7a.75.75 0 0 1 1.06 1.06l-7 7a3 3 0 0 1-4.243-4.243l7-7a4.5 4.5 0 0 1 6.364 6.364l-7 7a6 6 0 0 1-8.486-8.486l7-7a.75.75 0 0 1 1.06 1.06l-7 7a4.5 4.5 0 0 0 6.364 6.364l7-7a3 3 0 0 0 0-4.242Z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || uploading || (!pendingFile && !text.trim()) || overLimit}
            className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-40"
          >
            {sending ? (
              <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400 pl-1">
          {pendingFile
            ? <>Caption is optional · <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send</>
            : <><kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send &nbsp;·&nbsp; <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd> for new line</>}
        </p>
      </div>
      )}

    </section>
  );
}

