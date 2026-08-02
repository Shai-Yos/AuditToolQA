const NAMED_LABEL_CLASSES: Record<string, string> = {
  "P&PC":               "bg-blue-500 text-white",
  "D&D":                "bg-violet-600 text-white",
  "CAPA":               "bg-red-500 text-white",
  "Complaints":         "bg-orange-500 text-white",
  "C&R":                "bg-amber-500 text-white",
  "Management Control": "bg-teal-600 text-white",
  "Training":           "bg-green-600 text-white",
  "ICQA":               "bg-cyan-600 text-white",
  "PMS":                "bg-indigo-600 text-white",
  "Risk":               "bg-rose-600 text-white",
  "Regulatory":         "bg-purple-600 text-white",
  "Tool Validation":    "bg-slate-600 text-white",
  "HR":                 "bg-pink-600 text-white",
  "IT":                 "bg-sky-600 text-white",
  "Service":            "bg-emerald-600 text-white",
};

/** Returns Tailwind classes for a label pill in read-only display contexts. */
export function getLabelPillClass(lbl: string): string {
  if (/^FR\d+$/i.test(lbl)) return "bg-rose-600 text-white";
  return NAMED_LABEL_CLASSES[lbl] ?? "bg-blue-500 text-white";
}
