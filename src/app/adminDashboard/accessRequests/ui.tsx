"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewAccessRequest } from "./actions";
import { getInitials } from "@/components/shell-helpers";

type RequestRow = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  requestedRole: string;
  reason: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  AUDIT_OWNER: "Audit Owner",
  USER: "User",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Full access to all audits, users, and system configuration.",
  AUDIT_OWNER: "Can create and manage audits they own; assign users.",
  USER: "Can participate in audits they are assigned to.",
};

const ROLE_TINTS: Record<
  string,
  { selected: string; check: string; text: string }
> = {
  USER: {
    selected:
      "border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-200 dark:border-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/30",
    check: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  AUDIT_OWNER: {
    selected:
      "border-indigo-400 bg-indigo-50/70 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-500/10 dark:ring-indigo-500/30",
    check: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  ADMIN: {
    selected:
      "border-amber-400 bg-amber-50/70 ring-2 ring-amber-200 dark:border-amber-400 dark:bg-amber-500/10 dark:ring-amber-500/30",
    check: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
  },
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-700 ring-1 ring-red-200",
  CANCELLED: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
};

const STATUS_DOT: Record<string, string> = {
  PENDING: "bg-amber-500",
  APPROVED: "bg-emerald-500",
  REJECTED: "bg-red-500",
  CANCELLED: "bg-slate-400",
};

function initialsFor(name: string, email: string) {
  return getInitials(name || email || "?");
}

function avatarColor(seed: string) {
  const palette = [
    "bg-blue-100 text-blue-700",
    "bg-indigo-100 text-indigo-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
    "bg-violet-100 text-violet-700",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length]!;
}

function ReviewModal({
  request,
  action,
  onClose,
  onDone,
}: {
  request: RequestRow;
  action: "APPROVE" | "REJECT";
  onClose: () => void;
  onDone: () => void;
}) {
  const [approvedRole, setApprovedRole] = useState(request.requestedRole);
  const [reviewNote, setReviewNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isApprove = action === "APPROVE";
  const NOTE_MAX = 500;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isApprove && !reviewNote.trim()) {
      setError("Please provide a reason for rejection.");
      return;
    }
    startTransition(async () => {
      const result = await reviewAccessRequest({
        requestId: request.id,
        action,
        approvedRole: isApprove ? approvedRole : undefined,
        reviewNote: reviewNote.trim() || undefined,
      });
      if (result.success) {
        onDone();
      } else {
        setError(result.error ?? "Failed");
      }
    });
  }

  const roleChanged = isApprove && approvedRole !== request.requestedRole;
  const submittedLabel = new Date(request.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent bar */}
        <div
          className={[
            "h-1 w-full",
            isApprove
              ? "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500"
              : "bg-gradient-to-r from-red-400 via-rose-500 to-red-500",
          ].join(" ")}
        />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5">
          <div className="flex items-center gap-3">
            <div
              className={[
                "flex h-10 w-10 items-center justify-center rounded-xl ring-1",
                isApprove
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
                  : "bg-red-50 text-red-600 ring-red-100 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20",
              ].join(" ")}
            >
              {isApprove ? (
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div>
              <h2
                id="review-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-white"
              >
                {isApprove ? "Approve Access Request" : "Reject Access Request"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {isApprove
                  ? "Grant access and choose which role to assign."
                  : "The requester will be notified with your reason."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Requester summary card */}
        <div className="mx-6 mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex items-start gap-3">
            {request.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={request.image}
                alt={request.name}
                className="h-11 w-11 flex-shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
              />
            ) : (
              <div
                className={[
                  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  avatarColor(request.email),
                ].join(" ")}
              >
                {initialsFor(request.name, request.email)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold text-slate-900 dark:text-white" title={request.name}>
                {request.name}
              </p>
              <p className="break-all text-xs text-slate-500 dark:text-slate-400" title={request.email}>
                {request.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={[
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                    request.requestedRole === "ADMIN"
                      ? "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20"
                      : request.requestedRole === "AUDIT_OWNER"
                        ? "bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20"
                        : "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
                  ].join(" ")}
                >
                  {ROLE_LABELS[request.requestedRole] ?? request.requestedRole}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Submitted {submittedLabel}
                </span>
              </div>
            </div>
          </div>

          {request.reason && (
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Requester's reason
              </p>
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap pr-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {request.reason}
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 pb-6 pt-5">
          {isApprove && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Grant Role
                </label>
                {roleChanged && (
                  <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Changed from requested
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["USER", "AUDIT_OWNER", "ADMIN"] as const).map((r) => {
                  const selected = approvedRole === r;
                  const tint = ROLE_TINTS[r]!;
                  return (
                    <label
                      key={r}
                      className={[
                        "relative flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition",
                        selected
                          ? tint.selected
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500 dark:hover:bg-slate-700/50",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        checked={selected}
                        onChange={() => setApprovedRole(r)}
                        className="sr-only"
                      />
                      {selected && (
                        <span className={`absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-white shadow ${tint.check}`}>
                          <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                      <p
                        className={[
                          "text-sm font-semibold transition-colors",
                          selected ? tint.text : "text-slate-800 dark:text-slate-100",
                        ].join(" ")}
                      >
                        {ROLE_LABELS[r]}
                      </p>
                      {r === request.requestedRole && (
                        <span className="text-[9px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          requested
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {ROLE_DESCRIPTIONS[approvedRole]}
              </p>
            </div>
          )}

          {!isApprove && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Reason <span className="text-red-500">*</span>
                </label>
                <span
                  className={[
                    "text-[10px] tabular-nums",
                    reviewNote.length > NOTE_MAX * 0.9
                      ? "text-amber-500"
                      : "text-slate-400 dark:text-slate-500",
                  ].join(" ")}
                >
                  {reviewNote.length}/{NOTE_MAX}
                </span>
              </div>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value.slice(0, NOTE_MAX))}
                rows={3}
                autoFocus
                placeholder="Explain why the request is being rejected…"
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-red-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-red-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-red-400 dark:focus:ring-red-500/20"
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
            <p className="hidden text-[11px] text-slate-400 dark:text-slate-500 sm:block">
              Press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">Esc</kbd> to close
            </p>
            <div className="flex flex-1 gap-2 sm:flex-none">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 sm:flex-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className={[
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none",
                  isApprove
                    ? "bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-700"
                    : "bg-red-500 shadow-red-500/20 hover:bg-red-700",
                ].join(" ")}
              >
                {isPending ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Processing…
                  </>
                ) : isApprove ? (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                    </svg>
                    Approve as {ROLE_LABELS[approvedRole]}
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                    Reject Request
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

type SortKey = "name" | "requestedRole" | "status" | "createdAt";

type FilterKey = "ALL" | "PENDING" | "APPROVED" | "REJECTED";
type RoleFilterKey = "ALL" | "USER" | "AUDIT_OWNER" | "ADMIN";

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
          "ml-1 rounded p-0.5 transition",
          active
            ? "text-blue-600 dark:text-blue-400"
            : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
        ].join(" ")}
        title="Filter"
      >
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed z-50 min-w-[130px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 dark:bg-slate-800 dark:border-slate-700"
          style={{ top: pos.top, left: pos.left }}
        >
          <ul className="flex flex-col p-1">
            {options.map((o) => (
              <li
                key={o.value}
                onClick={(e) => { e.stopPropagation(); onChange(o.value); setOpen(false); }}
                className={[
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  value === o.value
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700",
                ].join(" ")}
              >
                {value === o.value && (
                  <svg className="h-3 w-3 shrink-0 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                )}
                {value !== o.value && <span className="h-3 w-3 shrink-0" />}
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AccessRequestsClient({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ request: RequestRow; action: "APPROVE" | "REJECT" } | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [roleFilter, setRoleFilter] = useState<RoleFilterKey>("ALL");
  const [search, setSearch] = useState("");

  const counts = {
    ALL: requests.length,
    PENDING: requests.filter((r) => r.status === "PENDING").length,
    APPROVED: requests.filter((r) => r.status === "APPROVED").length,
    REJECTED: requests.filter((r) => r.status === "REJECTED").length,
  };

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = requests.filter((r) => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (roleFilter !== "ALL" && r.requestedRole !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av = "";
    let bv = "";
    if (sortKey === "name") { av = a.name; bv = b.name; }
    else if (sortKey === "requestedRole") { av = a.requestedRole; bv = b.requestedRole; }
    else if (sortKey === "status") { av = a.status; bv = b.status; }
    else if (sortKey === "createdAt") { av = a.createdAt; bv = b.createdAt; }
    const cmp = av.localeCompare(bv);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleDone() {
    setModal(null);
    router.refresh();
  }

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent dark:from-slate-800/40 dark:via-transparent" />
      <div className="relative mx-auto w-full max-w-none px-4 pt-14 pb-10 sm:px-6 lg:px-8 xl:px-10">

        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Access Requests
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Review and manage user access to the platform.
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { label: "Total",    value: counts.ALL,      dot: "bg-slate-400",   text: "text-slate-700" },
              { label: "Pending",  value: counts.PENDING,  dot: "bg-amber-500",   text: "text-amber-700" },
              { label: "Approved", value: counts.APPROVED, dot: "bg-emerald-500", text: "text-emerald-700" },
              { label: "Rejected", value: counts.REJECTED, dot: "bg-red-500",     text: "text-red-700" },
            ] as const
          ).map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:bg-slate-800 dark:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</p>
              </div>
              <p className={`mt-2 text-2xl font-semibold ${s.text} dark:text-white`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Controls: search */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          <div className="relative w-full max-w-md">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:bg-slate-800 dark:border-slate-700">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700">
                <svg className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No requests found</p>
              <p className="mt-1 text-xs text-slate-400">Try adjusting the filter or search.</p>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 shadow-[0_1px_0_0_rgba(15,23,42,0.06)] dark:bg-slate-800 dark:text-slate-400">
                    {(
                      [
                        { key: "name",          label: "Requester",      sortable: true },
                        { key: "requestedRole", label: "Requested Role", sortable: true },
                        { key: "reason",        label: "Reason",         sortable: false },
                        { key: "createdAt",     label: "Submitted",      sortable: true },
                        { key: "status",        label: "Status",         sortable: true },
                        { key: "actions",       label: "Actions",        sortable: false },
                      ] as { key: string; label: string; sortable: boolean }[]
                    ).map(({ key, label, sortable }) => (
                      <th
                        key={key}
                        onClick={sortable ? () => toggleSort(key as SortKey) : undefined}
                        className={[
                          "whitespace-nowrap px-6 py-3 select-none transition-colors",
                          sortable ? "cursor-pointer hover:text-slate-800 dark:hover:text-white" : "",
                        ].join(" ")}
                      >
                        <span className="inline-flex items-center gap-1">
                          {label}
                          {sortable && (
                            sortKey === key ? (
                              <svg
                                className={[
                                  "h-3.5 w-3.5 transition-transform duration-150 text-slate-800 dark:text-white",
                                  sortDir === "asc" ? "-rotate-90" : "rotate-90",
                                ].join(" ")}
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <span className="inline-flex flex-col leading-none text-slate-300 dark:text-slate-600">
                                <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                                </svg>
                                <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                              </span>
                            )
                          )}
                          {key === "status" && (
                            <ColumnFilterDropdown<FilterKey>
                              value={filter}
                              onChange={setFilter}
                              options={[
                                { value: "ALL", label: "All" },
                                { value: "PENDING", label: "Pending" },
                                { value: "APPROVED", label: "Approved" },
                                { value: "REJECTED", label: "Rejected" },
                              ]}
                            />
                          )}
                          {key === "requestedRole" && (
                            <ColumnFilterDropdown<RoleFilterKey>
                              value={roleFilter}
                              onChange={setRoleFilter}
                              options={[
                                { value: "ALL", label: "All" },
                                { value: "USER", label: "User" },
                                { value: "AUDIT_OWNER", label: "Audit Owner" },
                                { value: "ADMIN", label: "Admin" },
                              ]}
                            />
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const isExpanded = expandedRowId === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setExpandedRowId(isExpanded ? null : r.id)}
                        className="group cursor-pointer border-t border-slate-100 transition first:border-t-0 hover:bg-slate-50/70 dark:border-slate-700 dark:hover:bg-slate-700/30"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {r.image ? (
                              <img
                                src={r.image}
                                alt={r.name}
                                className="h-9 w-9 flex-shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                              />
                            ) : (
                              <div
                                className={[
                                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                  avatarColor(r.email),
                                ].join(" ")}
                              >
                                {initialsFor(r.name, r.email)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="break-words font-medium text-slate-800 dark:text-slate-200 line-clamp-2" title={r.name}>{r.name}</p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={[
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                            r.requestedRole === "ADMIN"
                              ? "bg-amber-50 text-amber-800 ring-amber-200"
                              : r.requestedRole === "AUDIT_OWNER"
                                ? "bg-indigo-50 text-indigo-800 ring-indigo-200"
                                : "bg-emerald-50 text-emerald-800 ring-emerald-200",
                          ].join(" ")}>
                            {ROLE_LABELS[r.requestedRole] ?? r.requestedRole}
                          </span>
                        </td>
                        <td className="max-w-[220px] px-6 py-4">
                          {r.reason ? (
                            <p className={`text-xs text-slate-600 dark:text-slate-400 transition-all ${isExpanded ? "whitespace-pre-wrap" : "line-clamp-2 max-w-[210px]"}`}>
                              {r.reason}
                            </p>
                          ) : (
                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[r.status] ?? ""}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[r.status] ?? "bg-slate-400"}`} />
                            {r.status.toLowerCase()}
                          </span>
                          {r.reviewedByName && (
                            <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">by {r.reviewedByName}</p>
                          )}
                        </td>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          {r.status === "PENDING" ? (
                            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-700">
                              <button
                                onClick={() => setModal({ request: r, action: "APPROVE" })}
                                title="Approve"
                                className="group inline-flex items-center gap-1.5 border-r border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                                </svg>
                                Approve
                              </button>
                              <button
                                onClick={() => setModal({ request: r, action: "REJECT" })}
                                title="Reject"
                                className="group inline-flex items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                                Reject
                              </button>
                            </div>
                          ) : (
                            r.reviewNote ? (
                              <p className="max-w-[160px] truncate text-xs text-slate-500 dark:text-slate-400" title={r.reviewNote}>{r.reviewNote}</p>
                            ) : (
                              <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <ReviewModal
          request={modal.request}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
