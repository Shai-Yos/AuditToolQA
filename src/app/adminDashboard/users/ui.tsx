"use client";

import { useEffect, useRef, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeUserRole, addMember, setUserActive } from "./actions";
import { api } from "@/trpc/react";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
  isActive: boolean;
  createdAt: string;
  assignedAudits: number;
};

function initials(name: string) {
  const cleaned = name.replace(/\(.*?\)/g, "").trim();
  const parts = cleaned.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return (
    ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?"
  );
}

type AppRole = "ADMIN" | "AUDIT_OWNER" | "USER";

const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Admin",
  AUDIT_OWNER: "Audit Owner",
  USER: "User",
};

const ROLE_BADGE_CLASS: Record<AppRole, string> = {
  ADMIN: "bg-amber-100 text-amber-800",
  AUDIT_OWNER: "bg-indigo-100 text-indigo-800",
  USER: "bg-emerald-100 text-emerald-800",
};

const ROLE_ICON: Record<AppRole, React.ReactNode> = {
  ADMIN: (
    <svg className="h-3.5 w-3.5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  ),
  AUDIT_OWNER: (
    <svg className="h-3.5 w-3.5 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  ),
  USER: (
    <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  ),
};

function RoleSelector({ userId, initialRole }: { userId: string; initialRole: AppRole }) {
  const [role, setRole] = useState<AppRole>(initialRole);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function openDropdown() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  }

  function handleSelect(newRole: AppRole) {
    setOpen(false);
    if (newRole === role) return;
    setError(null);
    startTransition(async () => {
      const result = await changeUserRole(userId, newRole);
      if (result.success) {
        setRole(newRole);
      } else {
        setError(result.error ?? "Failed to update role");
      }
    });
  }

  const roles: AppRole[] = ["ADMIN", "AUDIT_OWNER", "USER"];

  return (
    <div className="flex w-fit flex-col gap-1" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        disabled={isPending}
        onClick={openDropdown}
        className={[
          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition",
          "focus:outline-none focus:ring-2 focus:ring-offset-1",
          isPending ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:brightness-95 active:scale-95",
          ROLE_BADGE_CLASS[role],
          "border-transparent focus:ring-current",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {ROLE_ICON[role]}
        {ROLE_LABELS[role]}
        {isPending ? (
          <svg className="ml-0.5 h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-3 w-3 opacity-60" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="fixed z-50 w-max overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <ul role="listbox" className="flex flex-col gap-1 p-1.5">
            {roles.map((r) => (
              <li
                key={r}
                role="option"
                aria-selected={r === role}
                onClick={() => handleSelect(r)}
                className={[
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  ROLE_BADGE_CLASS[r],
                  r === role ? "opacity-100 ring-2 ring-inset ring-current/30" : "opacity-70 hover:opacity-100",
                ].join(" ")}
              >
                {ROLE_ICON[r]}
                {ROLE_LABELS[r]}
                {r === role && (
                  <svg className="ml-1 h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ActiveToggle({ userId, initialActive }: { userId: string; initialActive: boolean }) {
  const [isActive, setIsActive] = useState(initialActive);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  }

  function handleAction() {
    setOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await setUserActive(userId, !isActive);
      if (result.success) {
        setIsActive((v) => !v);
      } else {
        setError(result.error ?? "Failed to update status");
      }
    });
  }

  return (
    <div ref={ref} className="flex flex-col gap-1">
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        disabled={isPending}
        className={[
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition",
          isPending ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:brightness-95 active:scale-95",
          isActive
            ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700"
            : "bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
        ].join(" ")}
      >
        {isPending ? (
          <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : isActive ? (
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        )}
        {isActive ? "Active" : "Inactive"}
        <svg className="ml-0.5 h-2.5 w-2.5 opacity-60" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 dark:bg-slate-800 dark:border-slate-700"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Change status
          </div>
          <ul className="flex flex-col p-1">
            <li
              onClick={isActive ? undefined : handleAction}
              className={[
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
                isActive
                  ? "cursor-default opacity-50 text-slate-400 dark:text-slate-500"
                  : "cursor-pointer text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30",
              ].join(" ")}
            >
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              Activate
              {isActive && <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">current</span>}
            </li>
            <li
              onClick={!isActive ? undefined : handleAction}
              className={[
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
                !isActive
                  ? "cursor-default opacity-50 text-slate-400 dark:text-slate-500"
                  : "cursor-pointer text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30",
              ].join(" ")}
            >
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
              Deactivate
              {!isActive && <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">current</span>}
            </li>
          </ul>
        </div>
      )}

      {error && <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

type AzureUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type SelectedUser = AzureUser & { role: AppRole };

const ROLE_CYCLE: AppRole[] = ["USER", "AUDIT_OWNER", "ADMIN"];
const ROLE_CHIP_COLORS: Record<AppRole, string> = {
  ADMIN: "bg-amber-100 text-amber-800 ring-amber-300 hover:bg-amber-200",
  AUDIT_OWNER: "bg-indigo-100 text-indigo-800 ring-indigo-300 hover:bg-indigo-200",
  USER: "bg-emerald-100 text-emerald-800 ring-emerald-300 hover:bg-emerald-200",
};

function AddMemberModal({
  defaultRole,
  existingUsers,
  onClose,
  onAdded,
}: {
  defaultRole: AppRole;
  existingUsers: { id: string; email: string; role: string }[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<SelectedUser[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results = [], isFetching } = api.user.searchDbUsers.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length >= 2 }
  );

  function toggleUser(u: AzureUser) {
    setSelected((prev) =>
      prev.some((s) => s.id === u.id)
        ? prev.filter((s) => s.id !== u.id)
        : [...prev, { ...u, role: defaultRole }]
    );
  }

  function removeUser(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }

  function cycleRole(id: string) {
    setSelected((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const idx = ROLE_CYCLE.indexOf(s.role);
        const next = ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length]!;
        return { ...s, role: next };
      })
    );
  }

  function handleAdd() {
    if (selected.length === 0) return;
    setError(null);
    startTransition(async () => {
      const results = await Promise.all(
        selected
          .filter((u) => u.email)
          .map((u) =>
            addMember({
              azureId: u.id,
              name: u.name ?? u.email ?? "",
              email: u.email!,
              role: u.role,
              image: u.image,
            })
          )
      );
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        setError(failed[0]?.error ?? "Some users failed to add");
      } else {
        onAdded();
      }
    });
  }

  const ROLE_LABELS: Record<AppRole, string> = { ADMIN: "Admin", AUDIT_OWNER: "Audit Owner", USER: "User" };

  const addLabel = isPending
    ? "Adding…"
    : selected.length === 0
      ? "Add Members"
      : `Add ${selected.length} Member${selected.length > 1 ? "s" : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-md flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Add Members</h2>
            <p className="mt-0.5 text-xs text-slate-500">Search and select users, then click each role badge to change it.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search Azure AD by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
          />
          {isFetching && (
            <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
        </div>

        {/* Results */}
        {debouncedSearch.length >= 2 && (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
            {results.length === 0 && !isFetching ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No users found</p>
            ) : (
              <ul>
                {results.map((u) => {
                  const isSelected = selected.some((s) => s.id === u.id);
                  const existing = existingUsers.find(
                    (e) => e.id === u.id || (u.email && e.email.toLowerCase() === u.email.toLowerCase())
                  );
                  return (
                    <li
                      key={u.id}
                      onClick={() => !existing && toggleUser(u)}
                      className={[
                        "flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 last:border-b-0",
                        existing
                          ? "cursor-not-allowed"
                          : "cursor-pointer transition hover:bg-slate-50",
                        isSelected ? "bg-blue-50" : "",
                      ].join(" ")}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-600 text-xs font-bold text-white">
                        {u.image ? (
                          <img src={u.image} alt={u.name ?? ""} className="h-full w-full object-cover" />
                        ) : (
                          <span>{(u.name ?? u.email ?? "?").slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{u.name ?? "—"}</p>
                        <p className="truncate text-xs text-slate-500">{u.email ?? "—"}</p>
                        {existing && (
                          <p className="mt-0.5 text-[10px] font-medium text-amber-600">
                            Already a member - use the Role column to change their role
                          </p>
                        )}
                      </div>
                      {existing ? (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                          existing.role === "ADMIN"
                            ? "bg-amber-100 text-amber-800 ring-amber-300"
                            : existing.role === "AUDIT_OWNER"
                              ? "bg-indigo-100 text-indigo-800 ring-indigo-300"
                              : "bg-emerald-100 text-emerald-800 ring-emerald-300"
                        }`}>
                          {ROLE_LABELS[existing.role as AppRole] ?? existing.role}
                        </span>
                      ) : (
                        <div className={[
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                          isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white",
                        ].join(" ")}>
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Selected users with per-user role */}
        {selected.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            {selected.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 shadow-sm"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-600 text-[9px] font-bold text-white">
                  {u.image ? (
                    <img src={u.image} alt={u.name ?? ""} className="h-full w-full object-cover" />
                  ) : (
                    (u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                  {u.name ?? u.email}
                </span>
                <button
                  type="button"
                  onClick={() => cycleRole(u.id)}
                  title="Click to change role"
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 transition ${ROLE_CHIP_COLORS[u.role]}`}
                >
                  {ROLE_LABELS[u.role]} ↻
                </button>
                <button
                  type="button"
                  onClick={() => removeUser(u.id)}
                  className="ml-0.5 shrink-0 rounded-full text-slate-400 hover:text-slate-700"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.length === 0 || isPending}
            className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {addLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

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

export default function UsersClient({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "active" | "inactive">("All");
  const [modalRole, setModalRole] = useState<AppRole | null>(null);
  const [sortKey, setSortKey] = useState<"name" | "email" | "role" | "assignedAudits" | "isActive" | "createdAt">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users.filter((u) => {
      const matchRole = roleFilter === "All" || u.role === roleFilter;
      const matchStatus =
        statusFilter === "All" ||
        (statusFilter === "active" ? u.isActive : !u.isActive);
      const matchQuery =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q);
      return matchRole && matchStatus && matchQuery;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":     cmp = (a.name || a.email).localeCompare(b.name || b.email); break;
        case "email":    cmp = a.email.localeCompare(b.email); break;
        case "role":     cmp = a.role.localeCompare(b.role); break;
        case "assignedAudits": cmp = a.assignedAudits - b.assignedAudits; break;
        case "isActive": cmp = (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1); break;
        case "createdAt": cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [users, query, roleFilter, statusFilter, sortKey, sortDir]);

  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const auditOwnerCount = users.filter((u) => u.role === "AUDIT_OWNER").length;
  const userCount = users.filter((u) => u.role === "USER").length;

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent dark:from-slate-800/40 dark:via-transparent" />
      <div className="relative mx-auto w-full max-w-none px-4 pt-16 pb-10 sm:px-6 lg:px-8 xl:px-10">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Users
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setModalRole(roleFilter === "All" ? "USER" : (roleFilter as AppRole))}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            <span className="text-lg leading-none">+</span>
            Add Member
          </button>
        </div>

        {/* Stats */}
        <div className="mb-6 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
            All: {users.length}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300">
            Admins: {adminCount}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-300">
            Audit Owners: {auditOwnerCount}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300">
            Users: {userCount}
          </span>
        </div>

        {/* Search */}
        <div className="mb-6 flex justify-center">
          <div className="relative w-full max-w-md">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[60vh] overflow-x-auto overflow-y-scroll">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {(
                  [
                    { key: "name",           label: "User" },
                    { key: "email",          label: "Email" },
                    { key: "role",           label: "Role",   filterable: true },
                    { key: "assignedAudits", label: "Assigned Audits", center: true },
                    { key: "isActive",       label: "Status", filterable: true },
                    { key: "createdAt",      label: "Joined" },
                  ] as { key: typeof sortKey; label: string; center?: boolean; filterable?: boolean }[]
                ).map(({ key, label, center, filterable }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className={[
                      "whitespace-nowrap px-6 py-3 select-none cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors",
                      center ? "text-center" : "",
                    ].join(" ")}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {sortKey === key ? (
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
                      )}
                      {filterable && key === "role" && (
                        <ColumnFilterDropdown<string>
                          value={roleFilter}
                          onChange={setRoleFilter}
                          options={[
                            { value: "All",         label: "All roles" },
                            { value: "ADMIN",       label: "Admin" },
                            { value: "AUDIT_OWNER", label: "Audit Owner" },
                            { value: "USER",        label: "User" },
                          ]}
                        />
                      )}
                      {filterable && key === "isActive" && (
                        <ColumnFilterDropdown<"All" | "active" | "inactive">
                          value={statusFilter}
                          onChange={setStatusFilter}
                          options={[
                            { value: "All",      label: "All statuses" },
                            { value: "active",   label: "Active" },
                            { value: "inactive", label: "Inactive" },
                          ]}
                        />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No users found.
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id} className="transition hover:bg-slate-50/60">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-200">
                        {u.image ? (
                          <img
                            src={u.image}
                            alt={u.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                            {initials(u.name || u.email)}
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-slate-800">
                        {u.name || "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{u.email || "—"}</td>
                  <td className="px-6 py-4">
                    <RoleSelector userId={u.id} initialRole={u.role as AppRole} />
                  </td>
                  <td className="px-6 py-4 text-center text-slate-600">
                    {u.assignedAudits}
                  </td>
                  <td className="px-6 py-4">
                    <ActiveToggle userId={u.id} initialActive={u.isActive} />
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Result count */}
        <p className="mt-3 text-center text-xs text-slate-400">
          {query || roleFilter !== "All"
            ? `Showing ${filtered.length} of ${users.length} registered user${users.length !== 1 ? "s" : ""}`
            : `${users.length} registered user${users.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Add Member Modal */}
      {modalRole && (
        <AddMemberModal
          defaultRole={modalRole}
          existingUsers={users.map((u) => ({ id: u.id, email: u.email, role: u.role }))}
          onClose={() => setModalRole(null)}
          onAdded={() => { setModalRole(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
