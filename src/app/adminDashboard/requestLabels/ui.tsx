"use client";

import { useState, useTransition, useRef } from "react";
import { getLabelPillClass } from "@/components/labelColors";
import { DEFAULT_REQUEST_LABELS } from "@/components/request-labels-shared";
import type { saveDefaultRequestLabels } from "./actions";

type LabelItem = { value: string; _key: string };

function withKeys(labels: string[]) {
  return labels.map((value, idx) => ({ value, _key: `${idx}|${value}` }));
}

function normalizeForSave(items: LabelItem[]) {
  return items.map((item) => item.value.trim()).filter((x) => x.length > 0);
}

export default function RequestLabelsUI({
  defaultLabels,
  saveDefaultRequestLabels: onSave,
}: {
  defaultLabels: string[];
  saveDefaultRequestLabels: typeof saveDefaultRequestLabels;
}) {
  const [labels, setLabels] = useState<LabelItem[]>(() => withKeys(defaultLabels));
  const [newLabel, setNewLabel] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [flash, setFlash] = useState<"saved" | "error" | null>(null);
  const dragKey = useRef<string | null>(null);

  const reset = () => setLabels(withKeys(defaultLabels));

  const resetToAppDefaults = () => setLabels(withKeys(DEFAULT_REQUEST_LABELS));

  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (labels.some((label) => label.value.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    setLabels((prev) => [...prev, { value: trimmed, _key: `new|${Date.now()}` }]);
  };

  const remove = (key: string) => {
    setLabels((prev) => prev.filter((label) => label._key !== key));
  };

  const startEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditingValue(value);
  };

  const commitEdit = () => {
    if (!editingKey) return;
    const nextValue = editingValue.trim();
    setLabels((prev) => prev.map((label) => {
      if (label._key !== editingKey) return label;
      if (!nextValue) return label;
      return { ...label, value: nextValue };
    }));
    setEditingKey(null);
  };

  const handleDragStart = (e: React.DragEvent, key: string) => {
    dragKey.current = key;
    setDraggingKey(key);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    const fromKey = dragKey.current || e.dataTransfer.getData("text/plain");
    if (!fromKey || fromKey === key) return;

    setLabels((prev) => {
      const from = prev.findIndex((item) => item._key === fromKey);
      const to = prev.findIndex((item) => item._key === key);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDragEnd = () => {
    dragKey.current = null;
    setDraggingKey(null);
  };

  const save = () => {
    startSave(async () => {
      try {
        await onSave(normalizeForSave(labels));
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
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Request Labels
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Default labels for new requests. Drag to reorder and click a label to rename.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {labels.map((label, idx) => {
            const isDragging = draggingKey === label._key;
            const rowColorClass = getLabelPillClass(label.value);
            return (
              <div
                key={label._key}
                draggable
                onDragStart={(e) => handleDragStart(e, label._key)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, label._key)}
                onDragEnd={handleDragEnd}
                className={[
                  "relative overflow-hidden rounded-2xl border border-transparent px-3 py-3 shadow-sm transition dark:brightness-75 dark:saturate-90",
                  rowColorClass,
                  isDragging ? "scale-95 opacity-50 ring-2 ring-blue-300 shadow-none" : "hover:shadow-md",
                ].join(" ")}
              >
                <div className="pointer-events-none absolute inset-0 bg-white/25 dark:bg-black/25" />
                <div className="relative z-10 flex items-center gap-2">
                  <svg className="h-5 w-5 shrink-0 cursor-move text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>

                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/20 text-xs font-semibold text-white">
                    {idx + 1}
                  </div>

                  {editingKey === label._key ? (
                    <input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(label._key, label.value)}
                      title="Click to rename"
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold text-white">
                        {label.value}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => remove(label._key)}
                    disabled={labels.length <= 1}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-20"
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { add(newLabel); setNewLabel(""); } }}
            placeholder="New label name..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => { add(newLabel); setNewLabel(""); }}
            className="shrink-0 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            + Add
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          {flash === "saved" && (
            <p className="w-full rounded-xl bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 ring-1 ring-green-200">
              ✓ Default labels saved
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
              className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={resetToAppDefaults}
              className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              App Defaults
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
