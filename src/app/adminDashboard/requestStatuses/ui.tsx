"use client";

import { useState, useTransition, useRef } from "react";
import { statusColors } from "@/components/audit-form/audit-form-shared";
import type { saveDefaultStatuses } from "./actions";

type StatusDraft = { name: string; order: number; color: string };
type StatusItem = StatusDraft & { _key: string };

export default function RequestStatusesUI({
  defaultStatuses,
  saveDefaultStatuses: onSave,
}: {
  defaultStatuses: StatusDraft[];
  saveDefaultStatuses: typeof saveDefaultStatuses;
}) {
  const [statuses, setStatuses] = useState<StatusItem[]>(() =>
    defaultStatuses.map((s, i) => ({ ...s, _key: `${i}|${s.name}` })),
  );
  const [saving, startSave] = useTransition();
  const [flash, setFlash] = useState<"saved" | "error" | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const dragKey = useRef<string | null>(null);

  const reset = () =>
    setStatuses(defaultStatuses.map((s, i) => ({ ...s, _key: `${i}|${s.name}` })));

  const remove = (key: string) =>
    setStatuses((prev) =>
      prev.filter((s) => s._key !== key).map((s, idx) => ({ ...s, order: idx + 1 })),
    );

  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStatuses((prev) => {
      const usedColors = new Set(prev.map((s) => s.color));
      const color =
        statusColors.find((sc) => !usedColors.has(sc.value))?.value ??
        statusColors[prev.length % statusColors.length]!.value;
      return [
        ...prev,
        { name: trimmed, order: prev.length + 1, color, _key: `new|${Date.now()}` },
      ];
    });
  };

  const startEdit = (key: string, name: string) => {
    setEditingKey(key);
    setEditingName(name);
  };

  const commitEdit = () => {
    if (!editingKey) return;
    setStatuses((prev) =>
      prev.map((s) =>
        s._key === editingKey ? { ...s, name: editingName.trim() || s.name } : s,
      ),
    );
    setEditingKey(null);
  };

  const handleDragStart = (key: string) => {
    dragKey.current = key;
    setDraggingKey(key);
  };
  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    if (!dragKey.current || dragKey.current === key) return;
    setStatuses((prev) => {
      const fromIdx = prev.findIndex((s) => s._key === dragKey.current);
      const toIdx = prev.findIndex((s) => s._key === key);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved!);
      return next.map((s, idx) => ({ ...s, order: idx + 1 }));
    });
  };
  const handleDragEnd = () => {
    dragKey.current = null;
    setDraggingKey(null);
  };

  const save = () => {
    startSave(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        await onSave(statuses.map(({ _key, ...s }) => s));
        setFlash("saved");
        setTimeout(() => setFlash(null), 2500);
      } catch {
        setFlash("error");
        setTimeout(() => setFlash(null), 3000);
      }
    });
  };

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent dark:from-slate-800/40 dark:via-transparent" />

      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Request Statuses
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Pre-populated when a new audit is created. Drag to reorder, click a label to rename.
          </p>
        </div>

        {/* Statuses grid */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {statuses.map((s, i) => {
            const colorInfo = statusColors.find((sc) => sc.value === s.color) ?? statusColors[0]!;
            const isDragging = draggingKey === s._key;
            return (
              <div
                key={s._key}
                draggable
                onDragStart={() => handleDragStart(s._key)}
                onDragOver={(e) => handleDragOver(e, s._key)}
                onDragEnd={handleDragEnd}
                className={[
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all shadow-sm select-none",
                  isDragging
                    ? "scale-95 opacity-50 ring-2 ring-blue-300 shadow-none"
                    : "hover:shadow-md",
                  colorInfo.bg,
                ].join(" ")}
                style={{ borderColor: s.color + "35" }}
              >
                <svg
                  className="h-5 w-5 shrink-0 cursor-move text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-slate-900 border border-slate-200 shadow-sm">
                  {i + 1}
                </div>

                {editingKey === s._key ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingKey(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
                  />
                ) : (
                  <span
                    onClick={(e) => { e.stopPropagation(); startEdit(s._key, s.name); }}
                    title="Click to rename"
                    className="flex-1 min-w-0 cursor-pointer truncate rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-white/60 transition"
                  >
                    {s.name}
                  </span>
                )}

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(s._key); }}
                  disabled={statuses.length <= 1}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-20"
                  title="Remove"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* Add row */}
        <div className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { add(newName); setNewName(""); } }}
            placeholder="New status name…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => { add(newName); setNewName(""); }}
            className="shrink-0 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            + Add
          </button>
        </div>

        {/* Save / Reset */}
        <div className="mt-4 flex flex-col items-center gap-3">
          {flash === "saved" && (
            <p className="w-full rounded-xl bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 ring-1 ring-green-200">
              ✓ Default statuses saved
            </p>
          )}
          {flash === "error" && (
            <p className="w-full rounded-xl bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200">
              ✗ Failed to save. Please try again.
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-200 bg-white px-8 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
