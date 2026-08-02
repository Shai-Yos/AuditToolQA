export type AzureUser = {
  id: string;
  name: string | null;
  email: string | null;
  image?: string | null;
};

export type FormState = { ok: true; saved?: boolean } | { ok: false; error: string };
export const initialFormState: FormState = { ok: false, error: "" };

export type StatusColumnDraft = {
  name: string;
  order: number;
  color: string;
};

export type CustomRoleEntry = {
  name: string;
  userIds: string[];
};

export type FRRoleAssignment = {
  frIndex: number;
  leadUserIds: string[];
  qmUserIds: string[];
  smeUserIds?: string[];
  transcriptionUserIds: string[];
  customRoles?: CustomRoleEntry[];
};

export type BRRoleAssignment = {
  brIndex: number;
  leadUserIds: string[];
  callerUserIds: string[];
  qmUserIds: string[];
  qualityReviewerUserIds: string[];
  smePrepUserIds: string[];
  outgoingUserIds: string[];
  incomingUserIds: string[];
  recordsPrepUserIds: string[];
  connectedFrIndices: number[];
  customRoles?: CustomRoleEntry[];
};

export type RoleConfig = { key: string; label: string; color: string };

export const statusColors = [
  { name: "Blue", value: "#3b82f6", bg: "bg-blue-200", text: "text-blue-700", border: "border-blue-300" },
  { name: "Purple", value: "#a855f7", bg: "bg-purple-200", text: "text-purple-700", border: "border-purple-300" },
  { name: "Green", value: "#22c55e", bg: "bg-green-200", text: "text-green-700", border: "border-green-300" },
  { name: "Yellow", value: "#eab308", bg: "bg-yellow-200", text: "text-yellow-700", border: "border-yellow-300" },
  { name: "Red", value: "#ef4444", bg: "bg-red-200", text: "text-red-700", border: "border-red-300" },
  { name: "Orange", value: "#f97316", bg: "bg-orange-200", text: "text-orange-700", border: "border-orange-300" },
  { name: "Pink", value: "#ec4899", bg: "bg-pink-200", text: "text-pink-700", border: "border-pink-300" },
  { name: "Indigo", value: "#6366f1", bg: "bg-indigo-200", text: "text-indigo-700", border: "border-indigo-300" },
  { name: "Teal", value: "#14b8a6", bg: "bg-teal-200", text: "text-teal-700", border: "border-teal-300" },
  { name: "Slate", value: "#64748b", bg: "bg-slate-200", text: "text-slate-700", border: "border-slate-300" },
  { name: "Lavender", value: "#8b5cf6", bg: "bg-violet-200", text: "text-violet-700", border: "border-violet-300" },
  { name: "Mint", value: "#10b981", bg: "bg-emerald-200", text: "text-emerald-700", border: "border-emerald-300" },
  { name: "Sky", value: "#0ea5e9", bg: "bg-sky-200", text: "text-sky-700", border: "border-sky-300" },
  { name: "Rose", value: "#f43f5e", bg: "bg-rose-200", text: "text-rose-700", border: "border-rose-300" },
  { name: "Amber", value: "#f59e0b", bg: "bg-amber-200", text: "text-amber-700", border: "border-amber-300" },
  { name: "Lime", value: "#84cc16", bg: "bg-lime-200", text: "text-lime-700", border: "border-lime-300" },
];

export const steps = [
  {
    key: "basic",
    label: "Basic Info",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    key: "rooms",
    label: "Rooms Setup",
    iconPaths: [
      "M12 3l9 5-9 5-9-5 9-5Z",
      "M3 12l9 5 9-5",
      "M3 17l9 5 9-5",
    ],
  },
  {
    key: "connections",
    label: "Connections",
    iconPaths: [
      "M8 12h8M12 8l4 4-4 4",
      "M3 6a3 3 0 100 6 3 3 0 000-6zm18 0a3 3 0 100 6 3 3 0 000-6zm-9 6a3 3 0 100 6 3 3 0 000-6z",
    ],
  },
  {
    key: "users",
    label: "Role Assignments",
    icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  },
  {
    key: "status",
    label: "Request Statuses",
    icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2",
  },
  {
    key: "review",
    label: "Review",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
] as const;

export type StepKey = (typeof steps)[number]["key"];

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function normalizeDateInput(value: string) {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return dt.toISOString();
}

export function getAvatarInitials(name: string) {
  const local = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  const parts = local.replace(/\(.*?\)/g, "").trim().split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return (((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?");
}

export function addUnique(list: string[], v: string) {
  if (list.includes(v)) return list;
  return [...list, v];
}

export function removeValue(list: string[], v: string) {
  return list.filter((x) => x !== v);
}
