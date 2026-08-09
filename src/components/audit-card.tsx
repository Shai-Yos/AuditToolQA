"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ExportModal, {
  type ExportType,
} from "@/app/adminDashboard/audits/[auditId]/_components/ExportModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditCardData = {
  id: string;
  trackId?: string;
  title: string;
  /**
   * If omitted, the card displays a static "ACTIVE" badge (user dashboard).
   */
  status?: "Draft" | "Active" | "Completed" | "Archived";
  startDate: string;
  endDate?: string | null;
  roomsCount: number;
  usersCount: number;
  requestsCount: number;
  createdByName?: string;
  /** Whether the current user owns/created this audit (shows OWNER badge). */
  isOwner?: boolean;
  isAssigned: boolean;
  assignees: { name: string; image?: string | null }[];
};

export type AuditCardProps = {
  audit: AuditCardData;
  /** URL prefix, e.g. "/adminDashboard" or "/userDashboard". */
  dashboardBase: string;
  viewMode: "grid" | "list";
  /**
   * Privilege flags — control which action buttons are shown.
   * All default to false (read-only / user-level).
   */
  canExport?: boolean;
  canEdit?: boolean;
  canCancel?: boolean;
  /**
   * Optional override for the "open" navigation action.
   * Useful when the caller needs to set context (e.g. useAuditNav) before navigating.
   * If not provided, the card navigates to `${dashboardBase}/audits/${audit.id}`.
   */
  onOpen?: () => void;
  /**
   * Called when the user confirms cancelling (archiving).
   * The component handles optimistic UI; the caller supplies the server action.
   */
  onCancel?: () => Promise<{ ok: boolean; error?: string }>;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center shadow-sm transition hover:bg-white hover:shadow-md">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
    </div>
  );
}

function AssigneeAvatars({
  assignees,
}: {
  assignees: { name: string; image?: string | null }[];
}) {
  if (assignees.length === 0) return null;
  const shown = assignees.slice(0, 4);
  const extra = assignees.length - shown.length;
  const initials = (name: string) => {
    const local = name.includes("@") ? (name.split("@")[0] ?? name) : name;
    const parts = local
      .replace(/\(.*?\)/g, "")
      .trim()
      .split(/[\s._\-]+/)
      .filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
    return (
      ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?"
    );
  };

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        Assigned
      </span>
      <div className="flex -space-x-2">
        {shown.map((u, i) => (
          <span
            key={i}
            title={u.name}
            className="inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-slate-600 ring-2 ring-white"
          >
            {u.image ? (
              <img src={u.image} alt={u.name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-white">
                {initials(u.name)}
              </span>
            )}
          </span>
        ))}
        {extra > 0 && (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 ring-2 ring-white text-[9px] font-bold text-slate-600">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuditCard
// ---------------------------------------------------------------------------

export function AuditCard({
  audit,
  dashboardBase,
  viewMode,
  canExport = false,
  canEdit = false,
  canCancel = false,
  onOpen,
  onCancel,
}: AuditCardProps) {
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [lockError, setLockError] = useState<{ lockedByName: string } | null>(null);

  // ── Navigation ──────────────────────────────────────────────────────────
  const handleOpen = () => {
    if (onOpen) {
      onOpen();
    } else {
      router.push(`${dashboardBase}/audits/${audit.id}`);
    }
  };

  // ── Edit (lock-check then navigate) ─────────────────────────────────────
  const handleEditClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`/api/audits/${audit.id}/lock`);
      if (res.ok) {
        const data = (await res.json()) as { locked: boolean; lockedByName?: string };
        if (data.locked) {
          setLockError({ lockedByName: data.lockedByName ?? "Another user" });
          return;
        }
      }
    } catch {
      // lock check failed — allow navigation anyway
    }
    router.push(`${dashboardBase}/editAudit/${audit.id}`);
  };

  // ── Cancel / Archive ─────────────────────────────────────────────────────
  const handleCancel = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (
      !confirm(
        `Are you sure you want to cancel "${audit.title}"? It will be archived.`,
      )
    )
      return;
    if (!onCancel) return;
    setIsCancelling(true);
    const result = await onCancel();
    if (result.ok) {
      router.refresh();
    } else {
      alert(result.error ?? "Failed to cancel audit");
      setIsCancelling(false);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExportConfirm = async (type: ExportType) => {
    setShowExportModal(false);
    setIsExporting(true);
    try {
      const res = await fetch(`/api/audits/${audit.id}/export?type=${type}`);
      if (!res.ok) {
        alert("Failed to export audit");
        return;
      }
      const blob = await res.blob();
      const safeName =
        audit.title.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "audit";
      const filename =
        type === "zip" ? `${safeName}_export.zip` : `${safeName}_export.xlsx`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("Failed to export audit");
    } finally {
      setIsExporting(false);
    }
  };

  // ── Date formatting ──────────────────────────────────────────────────────
  const fmtOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const startDate = new Date(audit.startDate);
  const startLabel = startDate.toLocaleDateString("en-GB", fmtOpts);
  const endLabel = audit.endDate
    ? new Date(audit.endDate).toLocaleDateString("en-GB", fmtOpts)
    : "Present";
  const localOffset =
    new Intl.DateTimeFormat("en", { timeZoneName: "shortOffset" })
      .formatToParts(startDate)
      .find((p) => p.type === "timeZoneName")
      ?.value?.replace("GMT", "UTC") ?? "";
  const dateRange =
    (audit.startDate === audit.endDate
      ? startLabel
      : `${startLabel} – ${endLabel}`) + (localOffset ? ` (${localOffset})` : "");

  // ── Badges ───────────────────────────────────────────────────────────────
  const statusBadge = (() => {
    const s = audit.status;
    if (!s) {
      return (
        <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 ring-1 ring-green-200">
          ACTIVE
        </span>
      );
    }
    return (
      <span
        className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
          s === "Active"
            ? "bg-green-50 text-green-700 ring-green-200"
            : s === "Completed"
            ? "bg-blue-50 text-blue-700 ring-blue-200"
            : s === "Archived"
            ? "bg-slate-100 text-slate-700 ring-slate-200"
            : "bg-slate-100 text-slate-700 ring-slate-200"
        }`}
      >
        {s.toUpperCase()}
      </span>
    );
  })();

  // ── Lock modal ───────────────────────────────────────────────────────────
  const lockModal = lockError && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={() => setLockError(null)}
    >
      <div
        className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-lg text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-3xl">🔒</span>
        <h3 className="text-base font-semibold text-amber-900">Editing Locked</h3>
        <p className="text-sm text-amber-800">
          <strong>{lockError.lockedByName}</strong> is currently editing this audit.
          You can still view it, but editing is unavailable until they finish.
        </p>
        <button
          type="button"
          onClick={() => setLockError(null)}
          className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          OK
        </button>
      </div>
    </div>
  );

  // =========================================================================
  // LIST VIEW
  // =========================================================================
  if (viewMode === "list") {
    return (
      <>
        {showExportModal && (
          <ExportModal
            auditTitle={audit.title}
            onConfirm={handleExportConfirm}
            onClose={() => setShowExportModal(false)}
          />
        )}
        {lockModal}
        <div
          onClick={handleOpen}
          className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:ring-2 hover:ring-blue-200"
        >
          <div className="flex flex-col gap-3">
            {/* Title row */}
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-2xl ring-1 ring-slate-200">
                📋
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900 transition-colors group-hover:text-blue-700">
                    {audit.title || "(untitled)"}
                  </div>
                  {audit.trackId && (
                    <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-700">
                      {audit.trackId}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">📅 {dateRange}</span>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`${dashboardBase}/audits/${audit.id}/chats`);
                    }}
                    className="inline-flex items-center gap-1 hover:text-blue-700"
                  >
                    🏠 {audit.roomsCount} rooms
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`${dashboardBase}/audits/${audit.id}/assignees`);
                    }}
                    className="inline-flex items-center gap-1 hover:text-blue-700"
                  >
                    👥 {audit.usersCount} users
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`${dashboardBase}/audits/${audit.id}/requests`);
                    }}
                    className="inline-flex items-center gap-1 hover:text-blue-700"
                  >
                    📝 {audit.requestsCount} requests
                  </button>
                  {audit.createdByName && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        👤 {audit.createdByName}
                      </span>
                    </>
                  )}
                </div>
                {audit.assignees.length > 0 && (
                  <div className="mt-2">
                    <AssigneeAvatars assignees={audit.assignees} />
                  </div>
                )}
              </div>
            </div>

            {/* Badges + actions row */}
            <div
              className="flex flex-col gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-center gap-2">
                {audit.isOwner && (
                  <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                    OWNER
                  </span>
                )}
                {audit.isAssigned && (
                  <span className="rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 ring-1 ring-purple-200">
                    ASSIGNED
                  </span>
                )}
                {statusBadge}
                {canExport && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowExportModal(true);
                    }}
                    disabled={isExporting}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-4 text-sm font-semibold text-green-700 shadow-sm transition hover:border-green-300 hover:bg-green-100 disabled:opacity-50"
                    title="Export Audit"
                  >
                    📥 {isExporting ? "Exporting..." : "Export"}
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={handleEditClick}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100"
                    title="Edit Audit"
                  >
                    ✏️ Edit
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={(e) => void handleCancel(e)}
                    disabled={isCancelling}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-100 disabled:opacity-50"
                    title="Cancel Audit"
                  >
                    ❌ {isCancelling ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpen();
                }}
                className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Open Audit →
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // =========================================================================
  // GRID VIEW
  // =========================================================================
  return (
    <>
      {showExportModal && (
        <ExportModal
          auditTitle={audit.title}
          onConfirm={handleExportConfirm}
          onClose={() => setShowExportModal(false)}
        />
      )}
      {lockModal}
      <div
        onClick={handleOpen}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md hover:ring-2 hover:ring-blue-200"
      >
        <div className="relative p-6">
          {/* Header: icon + badges */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-2xl ring-1 ring-slate-200">
              📋
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {audit.isOwner && (
                <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                  OWNER
                </span>
              )}
              {audit.isAssigned && (
                <span className="rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 ring-1 ring-purple-200">
                  ASSIGNED
                </span>
              )}
              {statusBadge}
            </div>
          </div>

          {/* Title */}
          <div className="mt-4 line-clamp-3 text-lg font-semibold leading-snug text-slate-900 transition-colors group-hover:text-blue-700">
            {audit.title || "(untitled)"}
          </div>
          {audit.trackId && (
            <div className="mt-2">
              <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-2.5 py-1 font-mono text-[11px] font-bold text-blue-700">
                {audit.trackId}
              </span>
            </div>
          )}

          {/* Mini stats */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`${dashboardBase}/audits/${audit.id}/chats`);
              }}
              className="w-full"
              type="button"
              title="Open rooms"
            >
              <MiniStat label="Rooms" value={audit.roomsCount} icon="🏠" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`${dashboardBase}/audits/${audit.id}/assignees`);
              }}
              className="w-full"
              type="button"
              title="Open participants"
            >
              <MiniStat label="Users" value={audit.usersCount} icon="👥" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`${dashboardBase}/audits/${audit.id}/requests`);
              }}
              className="w-full"
              type="button"
              title="Open requests"
            >
              <MiniStat label="Requests" value={audit.requestsCount} icon="📝" />
            </button>
          </div>

          {/* Date */}
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
            <span>📅</span>
            <span>{dateRange}</span>
          </div>

          {/* Creator */}
          {audit.createdByName && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span>👤</span>
              <span>
                Created by{" "}
                <span className="font-medium text-slate-700">{audit.createdByName}</span>
              </span>
            </div>
          )}

          {/* Assignees */}
          {audit.assignees.length > 0 && (
            <div className="mt-4">
              <AssigneeAvatars assignees={audit.assignees} />
            </div>
          )}

          {/* Action buttons */}
          <div
            className="mt-6 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {(canExport || canEdit || canCancel) && (
              <div className="flex flex-wrap justify-center gap-2">
                {canExport && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowExportModal(true);
                    }}
                    disabled={isExporting}
                    className="flex items-center justify-center rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 shadow-sm transition hover:border-green-300 hover:bg-green-100 hover:text-green-800 active:scale-[0.99] disabled:opacity-50"
                    title="Export Audit"
                  >
                    {isExporting ? "Exporting..." : "📥 Export"}
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={handleEditClick}
                    className="flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 active:scale-[0.99]"
                    title="Edit Audit"
                  >
                    ✏️ Edit
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={(e) => void handleCancel(e)}
                    disabled={isCancelling}
                    className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-100 hover:text-red-800 active:scale-[0.99] disabled:opacity-50"
                    title="Cancel Audit"
                  >
                    {isCancelling ? "Cancelling..." : "❌ Cancel"}
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleOpen}
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99]"
            >
              Open Audit
              <span className="text-lg transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
