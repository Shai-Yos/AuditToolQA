"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRequest, type CreateRequestInput } from "./actions";
import { useAuditNav } from "@/components/audit-nav-context";
import { DatePicker } from "@/components/DatePicker";

type State = { ok: true; redirectTo: string } | { ok: false; error: string };
const initialState: State = { ok: false, error: "" };

const STATIC_LABELS = [
  "P&PC", "D&D", "CAPA", "Complaints", "C&R", "Management Control",
  "Training", "ICQA", "PMS", "Risk", "Regulatory", "Tool Validation",
  "HR", "IT", "Service",
];

const FR_COLORS_INACTIVE = [
  "bg-red-50    text-red-700    ring-red-300",
  "bg-orange-50 text-orange-700 ring-orange-300",
  "bg-amber-50  text-amber-700  ring-amber-300",
  "bg-green-50  text-green-700  ring-green-300",
  "bg-teal-50   text-teal-700   ring-teal-300",
  "bg-blue-50   text-blue-700   ring-blue-300",
  "bg-violet-50 text-violet-700 ring-violet-300",
  "bg-pink-50   text-pink-700   ring-pink-300",
] as const;

const FR_COLORS_ACTIVE = [
  "bg-red-600    text-white ring-red-600",
  "bg-orange-500 text-white ring-orange-500",
  "bg-amber-500  text-white ring-amber-500",
  "bg-green-600  text-white ring-green-600",
  "bg-teal-600   text-white ring-teal-600",
  "bg-blue-600   text-white ring-blue-600",
  "bg-violet-600 text-white ring-violet-600",
  "bg-pink-600   text-white ring-pink-600",
] as const;

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
  { border: "border-fuchsia-500", bg: "bg-fuchsia-500",   hover: "hover:bg-fuchsia-600" },
  { border: "border-lime-500",    bg: "bg-lime-500",      hover: "hover:bg-lime-600" },
  { border: "border-amber-500",   bg: "bg-amber-500",    hover: "hover:bg-amber-600" },
  { border: "border-cyan-500",    bg: "bg-cyan-500",     hover: "hover:bg-cyan-600" },
  { border: "border-rose-500",    bg: "bg-rose-500",     hover: "hover:bg-rose-600" },
  { border: "border-violet-500",  bg: "bg-violet-500",   hover: "hover:bg-violet-600" },
  { border: "border-orange-500",  bg: "bg-orange-500",   hover: "hover:bg-orange-600" },
  { border: "border-teal-500",    bg: "bg-teal-500",     hover: "hover:bg-teal-600" },
];
export default function CreateRequestUI({
  auditId,
  auditTitle,
  defaultStatusColumnId,
  returnTab,
  frontRoomsCount = 1,
}: {
  auditId: string;
  auditTitle: string;
  defaultStatusColumnId: string | null;
  returnTab: string;
  frontRoomsCount?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<State>(initialState);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [customLabelInput, setCustomLabelInput] = useState("");
  const [selectedFr, setSelectedFr] = useState<number>(1);
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const { setActiveAudit } = useAuditNav();

  useEffect(() => {
    setActiveAudit({ id: auditId, title: auditTitle, tab: "requests" });
    return () => setActiveAudit(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, auditTitle]);

  useEffect(() => {
    if (state.ok) {
      setSuccess(true);
      const timer = setTimeout(() => router.push(state.redirectTo), 2000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const toggleLabel = (lbl: string) =>
    setSelectedLabels((prev) =>
      prev.includes(lbl) ? prev.filter((l) => l !== lbl) : [...prev, lbl]
    );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />

      <div className="relative mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="w-full lg:w-auto text-center flex flex-col items-center">
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 text-center sm:text-3xl max-w-4xl break-words" title={auditTitle}>
            {auditTitle}
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
        </div>
      </div>

        {/* Form card */}
        {success ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col items-center gap-4 px-6 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">Request Created!</p>
              <p className="mt-1 text-sm text-slate-500">Redirecting in a moment...</p>
            </div>
          </div>
        ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header — mirrors the modal */}
          <div className="flex flex-col items-center border-b border-slate-200 px-4 py-4 bg-white">
            <h2 className="text-base font-semibold text-slate-900">New Request</h2>
          </div>

          <form className="p-6 space-y-5" onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const formElements = form.elements as HTMLFormControlsCollection;
            const titleEl = form.querySelector<HTMLInputElement>('input[name="title"]');
            const frIndexEl = form.querySelector<HTMLInputElement>('input[name="frIndex"]:checked');
            const isFormalEl = form.querySelector<HTMLInputElement>('input[name="isFormal"]:checked');
            const input: CreateRequestInput = {
              auditId,
              title: titleEl?.value || "",
              isFormal: isFormalEl?.value || "false",
              returnTab,
              frIndex: frIndexEl?.value || "1",
              labels: selectedLabels,
              estimatedDeliveryDate: estimatedDeliveryDate || undefined,
            };
            startTransition(async () => {
              const result = await createRequest(state, input);
              setState(result);
            });
          }}>
          <input type="hidden" name="auditId" value={auditId} />
          <input type="hidden" name="statusColumnId" value={defaultStatusColumnId || ""} />
          <input type="hidden" name="returnTab" value={returnTab} />

          {/* Related FR */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Related FR</div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: frontRoomsCount }).map((_, i) => (
                <label key={i} className="inline-flex cursor-pointer items-center" onClick={() => setSelectedFr(i + 1)}>
                  <input
                    type="radio"
                    name="frIndex"
                    value={String(i + 1)}
                    checked={selectedFr === i + 1}
                    onChange={() => setSelectedFr(i + 1)}
                    className="sr-only"
                  />
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ring-1 transition-all flex items-center gap-1 ${
                    selectedFr === i + 1
                      ? `${FR_COLORS_ACTIVE[i % FR_COLORS_ACTIVE.length]} scale-105 shadow-sm`
                      : FR_COLORS_INACTIVE[i % FR_COLORS_INACTIVE.length]
                  }`}>
                    {selectedFr === i + 1 && <span className="text-base leading-none">✓</span>}
                    FR{i + 1}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Title */}
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Title</span>
            <input
              name="title"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="e.g. Design History File for XR-2000"
              required
              autoFocus
            />
          </label>

          {/* Type */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Type</div>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer transition hover:bg-slate-50 has-[:checked]:ring-2 has-[:checked]:ring-blue-200 has-[:checked]:border-blue-200">
                <input type="radio" name="isFormal" value="true" className="text-blue-600" />
                <span>Formal</span>
              </label>
              <label className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer transition hover:bg-slate-50 has-[:checked]:ring-2 has-[:checked]:ring-blue-200 has-[:checked]:border-blue-200">
                <input type="radio" name="isFormal" value="false" defaultChecked className="text-blue-600" />
                <span>Informal</span>
              </label>
            </div>
          </div>

          {/* ETA */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Estimated Delivery Date</div>
            <DatePicker
              value={estimatedDeliveryDate}
              onChange={setEstimatedDeliveryDate}
              placeholder="Pick a date…"
            />
          </div>

          {/* Labels */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Labels</div>
            <div className="flex flex-wrap gap-2">
              {STATIC_LABELS.map((lbl) => {
                const palette = LABEL_PALETTE[lbl] ?? { inactive: "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700", active: "border-blue-500 bg-blue-500 text-white shadow-sm" };
                return (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => toggleLabel(lbl)}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-semibold transition flex items-center gap-1.5",
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
                    onClick={() => toggleLabel(lbl)}
                    className={`rounded-full border ${c.border} ${c.bg} ${c.hover} px-3 py-1 text-xs font-semibold text-white shadow-sm transition flex items-center gap-1.5`}
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = customLabelInput.trim();
                      if (val && !selectedLabels.includes(val)) toggleLabel(val);
                      setCustomLabelInput("");
                    }
                  }}
                  placeholder="Add..."
                  className="bg-transparent pl-3 py-1 w-14 text-xs font-semibold text-slate-500 outline-none placeholder:text-slate-400 focus:text-blue-700"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = customLabelInput.trim();
                    if (val && !selectedLabels.includes(val)) toggleLabel(val);
                    setCustomLabelInput("");
                  }}
                  className="pr-2.5 pl-1 py-1 text-slate-400 hover:text-blue-600 transition font-bold text-base leading-none"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {!state.ok && state.error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <Link
              href="/adminDashboard"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 text-center"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={pending || success}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
        </div>
        )}
      </div>
    </main>
  );
}
