"use client";

import { useState } from "react";
import { getLabelPillClass } from "@/components/labelColors";
import { useDraggable, useDroppable } from "@dnd-kit/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequestCard = {
  id: string;
  title: string;
  trackNumber: string | null;
  labels: string[];
  statusColumnId: string | null;
  statusName: string;
  isFormal: boolean | null;
  code: string | null;
  createdAt: string;
  documentsCount: number;
  commentsCount: number;
  creatorId: string | null;
  creatorName?: string | null;
  creatorImage?: string | null;
  assignees: { id: string; name: string; image: string | null }[];
  estimatedDeliveryDate: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function relativeTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.max(1, Math.floor((Date.now() - t) / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const mo = Math.floor(day / 30);
  const yr = Math.floor(day / 365);
  if (yr >= 2) return `about ${yr} years ago`;
  if (yr === 1) return `about 1 year ago`;
  if (mo >= 2) return `about ${mo} months ago`;
  if (mo === 1) return `about 1 month ago`;
  if (day >= 2) return `${day} days ago`;
  if (day === 1) return `1 day ago`;
  if (hr >= 2) return `${hr} hours ago`;
  if (hr === 1) return `1 hour ago`;
  if (min >= 2) return `${min} minutes ago`;
  if (min === 1) return `1 minute ago`;
  return `just now`;
}

function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "blue" | "red" | "green" | "purple" | "orange" | "rose";
}) {
  const styles: Record<string, string> = {
    neutral: "ring-slate-200 bg-white text-slate-700",
    blue: "ring-blue-200 bg-blue-50 text-blue-700",
    red: "ring-red-200 bg-red-50 text-red-700",
    green: "ring-emerald-200 bg-emerald-50 text-emerald-700",
    purple: "bg-violet-600 text-white",
    orange: "bg-amber-500 text-white",
    rose: "bg-rose-600 text-white",
  };
  return (
    <span
      className={[
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
        styles[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function CreatorAvatar({ name, image }: { name?: string | null; image?: string | null }) {
  const [failed, setFailed] = useState(false);
  const label = name ?? "?";
  const inits = initials(label);
  if (image && !failed) {
    return (
      <img
        src={image}
        alt={label}
        title={label}
        className="h-6 w-6 rounded-full object-cover ring-1 ring-slate-200"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200"
      title={label}
    >
      {inits}
    </span>
  );
}

function AssigneeAvatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  const inits = initials(name);
  if (image && !failed) {
    return (
      <img
        src={image}
        alt={name}
        title={name}
        className="h-6 w-6 rounded-full object-cover ring-2 ring-white"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-600 text-[9px] font-bold text-white ring-2 ring-white"
      title={name}
    >
      {inits}
    </span>
  );
}

// ---------------------------------------------------------------------------
// RequestCardView
// Privileges are controlled by which optional props are passed:
//   - isCancelled          — dims the card and strikes the title (admin only)
//   - onDocumentsClick     — makes the documents badge a clickable button (admin only)
//   - onCancel             — shows the Cancel action button (admin only)
//   - onRework             — shows the Rework action button (admin only)
//   - onCommentsClick      — makes the comments badge interactive (all roles)
//   - onClick              — makes the whole card clickable (all roles)
// ---------------------------------------------------------------------------

export function RequestCardView({
  req,
  roomLabel: _roomLabel,
  statusColor,
  isCancelled,
  onClick,
  onCommentsClick,
  onDocumentsClick,
  onCancel,
  onRework,
}: {
  req: RequestCard;
  roomLabel: string;
  statusColor: string;
  /** Admin only: dims the card and applies line-through to the title */
  isCancelled?: boolean;
  onClick?: (resetLoading: () => void) => void;
  onCommentsClick?: (e: React.MouseEvent) => void;
  /** Admin only: makes the documents badge a clickable button */
  onDocumentsClick?: (e: React.MouseEvent) => void;
  /** Admin only: shows the cancel action button */
  onCancel?: (e: React.MouseEvent) => void;
  /** Admin only: shows the rework action button */
  onRework?: (e: React.MouseEvent) => void;
}) {
  const [loading, setLoading] = useState(false);
  const time = req.createdAt ? relativeTime(req.createdAt) : "";
  const formalTag = req.isFormal === null ? null : req.isFormal ? "Formal" : "Informal";

  return (
    <div
      onClick={() => {
        if (onClick) {
          setLoading(true);
          onClick(() => setLoading(false));
        }
      }}
      className={`relative rounded-2xl border p-4 shadow-sm transition cursor-pointer ${
        loading
          ? "border-blue-300 bg-blue-50 ring-2 ring-blue-200 shadow-md"
          : isCancelled
          ? "border-slate-300 bg-slate-100 opacity-60 hover:opacity-80"
          : "border-slate-200 bg-white hover:shadow-md hover:ring-2 hover:ring-blue-200 active:bg-blue-50 active:border-blue-300"
      }`}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70">
          <svg className="h-6 w-6 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* Title + status badge */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={`line-clamp-2 text-sm font-semibold ${
            isCancelled ? "text-slate-400 line-through" : "text-slate-900"
          }`}
        >
          {req.trackNumber ?? req.title}
        </span>
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          style={{
            backgroundColor: statusColor + "12",
            borderColor: statusColor + "55",
            color: statusColor,
          }}
        >
          {req.statusName}
        </span>
      </div>

      {/* Labels */}
      <div className="mt-3 flex flex-col gap-1.5">
        {(req.labels.some((lbl) => /^FR\d+$/i.test(lbl)) || formalTag) && (
          <div className="flex flex-wrap gap-1.5">
            {req.labels.filter((lbl) => /^FR\d+$/i.test(lbl)).map((lbl) => (
              <Tag key={lbl} tone="rose">{lbl}</Tag>
            ))}
            {formalTag && (
              <Tag tone={formalTag === "Formal" ? "purple" : "orange"}>{formalTag}</Tag>
            )}
          </div>
        )}
        {req.labels.filter((lbl) => !/^FR\d+$/i.test(lbl)).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {req.labels.filter((lbl) => !/^FR\d+$/i.test(lbl)).map((lbl) => (
              <span
                key={lbl}
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getLabelPillClass(lbl)}`}
              >
                {lbl}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Estimated delivery date */}
      {req.estimatedDeliveryDate && (
        <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400">
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          ETA{" "}
          {new Date(req.estimatedDeliveryDate + "T12:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })} UTC
        </p>
      )}

      {/* Assignees */}
      {req.assignees.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Assigned
          </span>
          <div className="flex -space-x-2">
            {req.assignees.slice(0, 4).map((a) => (
              <AssigneeAvatar key={a.id} name={a.name} image={a.image} />
            ))}
          </div>
          {req.assignees.length > 4 && (
            <span className="text-xs font-semibold text-slate-500">
              +{req.assignees.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer: creator + action badges */}
      <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <CreatorAvatar name={req.creatorName} image={req.creatorImage} />
          <span>{time}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {/* Comments badge — clickable for all roles */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCommentsClick?.(e);
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 hover:ring-blue-300"
            title="View comments"
          >
            💬 <span className="font-semibold">{req.commentsCount}</span>
          </button>

          {/* Documents badge — clickable button (admin) or static span (users) */}
          {req.documentsCount > 0 && (
            onDocumentsClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDocumentsClick(e);
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100 hover:ring-violet-500"
                title="View documents"
              >
                📎 <span className="font-semibold">{req.documentsCount}</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-violet-700 ring-1 ring-violet-200">
                📎 <span className="font-semibold">{req.documentsCount}</span>
              </span>
            )
          )}

          {/* Cancel button — admin only */}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100 hover:ring-amber-300"
              title="Cancel request"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <path strokeLinecap="round" strokeWidth="2" d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </button>
          )}

          {/* Rework button — admin only */}
          {onRework && (
            <button
              type="button"
              onClick={onRework}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100 hover:ring-emerald-300"
              title="Rework request"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.49 9A9 9 0 005.64 5.64L4 4m16 16l-1.64-1.64A9 9 0 013.51 15" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DraggableRequestCard
// Wraps RequestCardView with @dnd-kit drag behaviour.
// Pass the same privilege props through to RequestCardView.
// ---------------------------------------------------------------------------

export function DraggableRequestCard({
  req,
  roomLabel,
  statusColor,
  isCancelled,
  onClick,
  onCommentsClick,
  onDocumentsClick,
  onCancel,
  onRework,
}: {
  req: RequestCard;
  roomLabel: string;
  statusColor: string;
  isCancelled?: boolean;
  onClick?: (resetLoading: () => void) => void;
  onCommentsClick?: (e: React.MouseEvent) => void;
  onDocumentsClick?: (e: React.MouseEvent) => void;
  onCancel?: (e: React.MouseEvent) => void;
  onRework?: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: req.id });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.6 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <RequestCardView
        req={req}
        roomLabel={roomLabel}
        statusColor={statusColor}
        isCancelled={isCancelled}
        onClick={onClick}
        onCommentsClick={onCommentsClick}
        onDocumentsClick={onDocumentsClick}
        onCancel={onCancel}
        onRework={onRework}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DroppableColumn
// ---------------------------------------------------------------------------

export function DroppableColumn({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={[className, isOver ? "ring-2 ring-blue-300 rounded-2xl transition" : ""].join(" ")}
    >
      {children}
    </div>
  );
}
