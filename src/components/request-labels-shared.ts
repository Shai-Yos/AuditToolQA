export const DEFAULT_REQUEST_LABELS = [
  "P&PC", "D&D", "CAPA", "Complaints", "C&R", "Management Control",
  "Training", "ICQA", "PMS", "Risk", "Regulatory", "Tool Validation",
  "HR", "IT", "Service",
];

export const LABEL_PALETTE: Record<string, { inactive: string; active: string }> = {
  "P&PC": { inactive: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300", active: "border-blue-500 bg-blue-500 text-white shadow-sm" },
  "D&D": { inactive: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-300", active: "border-violet-600 bg-violet-600 text-white shadow-sm" },
  "CAPA": { inactive: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300", active: "border-red-500 bg-red-500 text-white shadow-sm" },
  "Complaints": { inactive: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:border-orange-300", active: "border-orange-500 bg-orange-500 text-white shadow-sm" },
  "C&R": { inactive: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300", active: "border-amber-500 bg-amber-500 text-white shadow-sm" },
  "Management Control": { inactive: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 hover:border-teal-300", active: "border-teal-600 bg-teal-600 text-white shadow-sm" },
  "Training": { inactive: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300", active: "border-green-600 bg-green-600 text-white shadow-sm" },
  "ICQA": { inactive: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:border-cyan-300", active: "border-cyan-600 bg-cyan-600 text-white shadow-sm" },
  "PMS": { inactive: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300", active: "border-indigo-600 bg-indigo-600 text-white shadow-sm" },
  "Risk": { inactive: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300", active: "border-rose-600 bg-rose-600 text-white shadow-sm" },
  "Regulatory": { inactive: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-300", active: "border-purple-600 bg-purple-600 text-white shadow-sm" },
  "Tool Validation": { inactive: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50 hover:border-slate-300", active: "border-slate-600 bg-slate-600 text-white shadow-sm" },
  "HR": { inactive: "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 hover:border-pink-300", active: "border-pink-600 bg-pink-600 text-white shadow-sm" },
  "IT": { inactive: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300", active: "border-sky-600 bg-sky-600 text-white shadow-sm" },
  "Service": { inactive: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300", active: "border-emerald-600 bg-emerald-600 text-white shadow-sm" },
};

export const CUSTOM_LABEL_COLORS = [
  { border: "border-fuchsia-500", bg: "bg-fuchsia-500", hover: "hover:bg-fuchsia-600" },
  { border: "border-lime-500", bg: "bg-lime-500", hover: "hover:bg-lime-600" },
  { border: "border-amber-500", bg: "bg-amber-500", hover: "hover:bg-amber-600" },
  { border: "border-cyan-500", bg: "bg-cyan-500", hover: "hover:bg-cyan-600" },
  { border: "border-rose-500", bg: "bg-rose-500", hover: "hover:bg-rose-600" },
  { border: "border-violet-500", bg: "bg-violet-500", hover: "hover:bg-violet-600" },
  { border: "border-orange-500", bg: "bg-orange-500", hover: "hover:bg-orange-600" },
  { border: "border-teal-500", bg: "bg-teal-500", hover: "hover:bg-teal-600" },
];

export function parseDefaultRequestLabels(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_REQUEST_LABELS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_REQUEST_LABELS;
    const cleaned = parsed
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x.length > 0);
    return cleaned.length > 0 ? cleaned : DEFAULT_REQUEST_LABELS;
  } catch {
    return DEFAULT_REQUEST_LABELS;
  }
}
