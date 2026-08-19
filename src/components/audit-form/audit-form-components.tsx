"use client";

import React, { useState, useRef, useEffect } from "react";
import { api } from "@/trpc/react";
import type { AzureUser, RoleConfig, CustomRoleEntry } from "./audit-form-shared";
import { getAvatarInitials } from "./audit-form-shared";

export function RoomAssigner({
  title,
  accentBg,
  accentText,
  accentBorder,
  roles,
  getUserIds,
  addUser,
  removeUser,
  labelMap,
  onLabelAdd,
  customRoles = [],
  onAddCustomRole,
  onRemoveCustomRole,
}: {
  title: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  roles: RoleConfig[];
  getUserIds: (roleKey: string) => string[];
  addUser: (roleKey: string, userId: string) => void;
  removeUser: (roleKey: string, userId: string) => void;
  labelMap: Record<string, string | { name: string; image?: string }>;
  onLabelAdd: (id: string, name: string, image?: string | null, email?: string | null) => void;
  customRoles?: CustomRoleEntry[];
  onAddCustomRole?: (roleName: string, userId: string) => void;
  onRemoveCustomRole?: (roleName: string, userId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customRoleName, setCustomRoleName] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results = [], isLoading } = api.user.searchDbUsers.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length >= 2 }
  );

  const allAssigned: Array<{ id: string; role: RoleConfig; isCustom?: boolean; customRoleName?: string }> = [
    ...roles.flatMap((role) =>
      getUserIds(role.key).map((id) => ({ id, role }))
    ),
    ...customRoles.flatMap((cr) =>
      cr.userIds.map((id) => ({
        id,
        role: { key: `custom_${cr.name}`, label: cr.name, color: "bg-amber-100 text-amber-800 border border-amber-200" } as RoleConfig,
        isCustom: true,
        customRoleName: cr.name,
      }))
    ),
  ];
  const assignedIds = new Set(allAssigned.map((a) => a.id));

  // fetch images for assigned users when editing existing audit (userLabels may lack images)
  const missingIds = Array.from(assignedIds).filter((id) => {
    const entry = labelMap[id];
    if (!entry) return true;
    if (typeof entry === "string") return true;
    return !entry.image;
  });

  const { data: existingUsersWithImages = [] } = api.user.getUsersByIds.useQuery(
    { ids: missingIds },
    { enabled: missingIds.length > 0 }
  );

  React.useEffect(() => {
    if (!existingUsersWithImages || existingUsersWithImages.length === 0) return;
    existingUsersWithImages.forEach((u) => {
      const name = u.name || u.email || u.id;
      onLabelAdd(u.id, name, u.image ?? null);
    });
  }, [existingUsersWithImages]);

  return (
    <div className={`rounded-2xl border ${accentBorder} bg-white shadow-sm`}>
      <div className={`${accentBg} flex items-center gap-3 rounded-t-2xl px-5 py-3`}>
        <span className={`text-sm font-bold ${accentText}`}>{title}</span>
        {allAssigned.length > 0 && (
          <span className={`ml-auto rounded-full bg-white/50 px-2 py-0.5 text-xs font-semibold ${accentText}`}>
            {allAssigned.length} assigned
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {allAssigned.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(() => {
              // Group entries by user ID so each person shows once with multiple role badges
              const grouped = new Map<string, typeof allAssigned>();
              for (const entry of allAssigned) {
                if (!grouped.has(entry.id)) grouped.set(entry.id, []);
                grouped.get(entry.id)!.push(entry);
              }
              return Array.from(grouped.entries()).map(([id, entries]) => (
                <span
                  key={id}
                  onClick={() => {
                    const entry = labelMap[id];
                    const name = typeof entry === "string" ? entry : entry?.name;
                    setPending({ id, name: name ?? id });
                    setSearch("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 cursor-pointer hover:bg-slate-100 transition"
                >
                  {(() => {
                    const entry = labelMap[id];
                    const name = typeof entry === "string" ? entry : entry?.name;
                    const img = typeof entry === "string" ? undefined : entry?.image;
                    if (img) {
                      return (
                        <>
                          <img src={img} alt={name ?? id} className="h-5 w-5 shrink-0 rounded-full object-cover" />
                          <span>{name ?? id}</span>
                        </>
                      );
                    }
                    return (
                      <>
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[9px] font-bold text-white">
                          {getAvatarInitials(name ?? id)}
                        </span>
                        {name ?? id}
                      </>
                    );
                  })()}
                  {entries.map((entry) => (
                    <span key={entry.role.key} className="inline-flex items-center gap-0.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${entry.role.color}`}>
                        {entry.role.label}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if ('isCustom' in entry && entry.isCustom && onRemoveCustomRole && entry.customRoleName) {
                            onRemoveCustomRole(entry.customRoleName, id);
                          } else {
                            removeUser(entry.role.key, id);
                          }
                        }}
                        className="text-slate-400 hover:text-red-600 transition"
                        aria-label="Remove role"
                      >×</button>
                    </span>
                  ))}
                </span>
              ));
            })()}
          </div>
        )}

        <div className="relative">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPending(null); }}
            placeholder="Search and add a person…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pl-9 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-100"
            autoComplete="off"
          />
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>

        {search.length >= 2 && !pending && (
          <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-md">
            {(results as AzureUser[]).length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">{isLoading ? "Searching…" : "No results"}</p>
            ) : (
              (results as AzureUser[]).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                      const name = u.name || u.email || u.id;
                      onLabelAdd(u.id, name, u.image ?? null, u.email ?? null);
                      setPending({ id: u.id, name });
                      setSearch("");
                    }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {u.image ? (
                    <img src={u.image} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white">
                      {getAvatarInitials(u.name || u.email || u.id)}
                    </span>
                  )}
                  {u.name || u.email || u.id}
                </button>
              ))
            )}
          </div>
        )}

        {pending && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2.5 text-xs font-semibold text-slate-600">
              Assign <span className="text-slate-900">{pending.name}</span> — select one or more roles:
            </p>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const alreadyHasRole = getUserIds(role.key).includes(pending.id);
                return (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => {
                    if (alreadyHasRole) {
                      removeUser(role.key, pending.id);
                    } else {
                      addUser(role.key, pending.id);
                    }
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-80 ${alreadyHasRole ? "ring-2 ring-offset-1 ring-slate-400" : ""} ${role.color}`}
                >
                  {role.label}{alreadyHasRole ? " ✓" : ""}
                </button>
                );
              })}
              {onAddCustomRole && (
                <>
                  {!showCustomInput ? (
                    <button
                      type="button"
                      onClick={() => setShowCustomInput(true)}
                      className="rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                    >
                      + Custom Role
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        type="text"
                        value={customRoleName}
                        onChange={(e) => setCustomRoleName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const trimmed = customRoleName.trim();
                            if (trimmed) {
                              onAddCustomRole(trimmed, pending.id);
                              setShowCustomInput(false);
                              setCustomRoleName("");
                            }
                          }
                          if (e.key === "Escape") {
                            setShowCustomInput(false);
                            setCustomRoleName("");
                          }
                        }}
                        placeholder="Role name…"
                        className="w-28 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = customRoleName.trim();
                          if (trimmed) {
                            onAddCustomRole(trimmed, pending.id);
                            setShowCustomInput(false);
                            setCustomRoleName("");
                          }
                        }}
                        disabled={!customRoleName.trim()}
                        className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-40"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCustomInput(false); setCustomRoleName(""); }}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => { setPending(null); setShowCustomInput(false); setCustomRoleName(""); }}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarDateRangePicker({
  startDate,
  endDate,
  startTime,
  endTime,
  timezone,
  timezoneOptions,
  onStartChange,
  onEndChange,
  onStartTimeChange,
  onEndTimeChange,
  onTimezoneChange,
}: {
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  timezoneOptions?: { value: string; label: string }[];
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onStartTimeChange?: (time: string) => void;
  onEndTimeChange?: (time: string) => void;
  onTimezoneChange?: (tz: string) => void;
}) {
  const [tzSearch, setTzSearch] = useState("");
  const [tzOpen, setTzOpen] = useState(false);

  const filteredTzOptions = (timezoneOptions ?? []).filter((tz) =>
    !tzSearch.trim() || tz.label.toLowerCase().includes(tzSearch.toLowerCase())
  );
  const selectedTzLabel = timezoneOptions?.find((tz) => tz.value === timezone)?.label ?? timezone ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (startDate) return new Date(startDate + "T00:00:00");
    return new Date();
  });
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setMonthMenuOpen(false);
        setYearMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && pickerRef.current) {
      pickerRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isOpen]);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T00:00:00");
    return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} UTC`;
  };

  const getDuration = () => {
    if (!startDate || !endDate) return "";
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return days >= 0 ? `${days + 1} day${days !== 0 ? "s" : ""}` : "";
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const toDateString = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const todayLocal = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  const isPastDate = (dateStr: string) => dateStr < todayLocal;

  const handleDateClick = (dateStr: string) => {
    if (isPastDate(dateStr)) return;

    if (dateStr === startDate && dateStr === endDate && endDate !== "") {
      onStartChange("");
      onEndChange("");
      return;
    }

    if (dateStr === startDate && !endDate) {
      onEndChange(dateStr);
      return;
    }

    if (dateStr === endDate && dateStr !== startDate) {
      onEndChange("");
      return;
    }

    if (!startDate || (startDate && endDate)) {
      onStartChange(dateStr);
      onEndChange("");
    } else {
      const start = new Date(startDate + "T00:00:00");
      const clicked = new Date(dateStr + "T00:00:00");

      if (clicked < start) {
        onStartChange(dateStr);
        onEndChange(startDate);
      } else {
        onEndChange(dateStr);
      }
    }
  };

  const isDateInRange = (dateStr: string) => {
    if (!startDate) return false;
    const date = new Date(dateStr + "T00:00:00");
    const start = new Date(startDate + "T00:00:00");

    if (endDate) {
      const end = new Date(endDate + "T00:00:00");
      return date >= start && date <= end;
    } else if (hoverDate) {
      const hover = new Date(hoverDate + "T00:00:00");
      const rangeStart = hover < start ? hover : start;
      const rangeEnd = hover < start ? start : hover;
      return date >= rangeStart && date <= rangeEnd;
    }
    return false;
  };

  const isDateStart = (dateStr: string) => dateStr === startDate;
  const isDateEnd = (dateStr: string) => dateStr === endDate;

  const days = getDaysInMonth(currentMonth);
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: new Date(2000, i).toLocaleDateString("en-US", { month: "long" }),
  }));
  const yearOptions = Array.from({ length: 11 }, (_, i) => {
    const y = new Date().getFullYear() + i;
    return { value: y, label: String(y) };
  });

  return (
    <div className="relative" ref={pickerRef}>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Audit Period *</span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm outline-none transition hover:bg-white hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {startDate && endDate ? (
                <span className="text-slate-900 font-semibold">
                  {formatDateDisplay(startDate)}{startTime ? ` ${startTime}` : ""} → {formatDateDisplay(endDate)}{endTime ? ` ${endTime}` : ""}
                  {selectedTzLabel && <span className="text-slate-500 ml-1 font-medium text-xs">({selectedTzLabel})</span>}
                  {getDuration() && <span className="text-slate-500 ml-2 font-medium">({getDuration()})</span>}
                </span>
              ) : startDate ? (
                <span className="text-slate-700">
                  {formatDateDisplay(startDate)}{startTime ? ` ${startTime}` : ""} → <span className="text-slate-400">Select end date</span>
                </span>
              ) : (
                <span className="text-slate-400">Select date range</span>
              )}
            </div>

            <svg
              className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      </label>

      {isOpen && (
        <div className="absolute bottom-full z-50 mb-2 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setCurrentMonth(new Date(year, month - 1));
                setMonthMenuOpen(false);
                setYearMenuOpen(false);
              }}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setMonthMenuOpen((v) => !v);
                    setYearMenuOpen(false);
                  }}
                  className="inline-flex min-w-[132px] items-center justify-between gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {monthOptions[month]?.label}
                  <svg className={`h-3.5 w-3.5 text-slate-400 transition ${monthMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {monthMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
                    <ul className="max-h-56 overflow-y-auto p-1.5">
                      {monthOptions.map((o) => (
                        <li
                          key={o.value}
                          onClick={() => {
                            setCurrentMonth(new Date(year, o.value));
                            setMonthMenuOpen(false);
                          }}
                          className={[
                            "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition",
                            month === o.value ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {month === o.value ? (
                            <svg className="h-3 w-3 shrink-0 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <span className="h-3 w-3 shrink-0" />
                          )}
                          {o.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setYearMenuOpen((v) => !v);
                    setMonthMenuOpen(false);
                  }}
                  className="inline-flex min-w-[92px] items-center justify-between gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {year}
                  <svg className={`h-3.5 w-3.5 text-slate-400 transition ${yearMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {yearMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[120px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
                    <ul className="max-h-56 overflow-y-auto p-1.5">
                      {yearOptions.map((o) => (
                        <li
                          key={o.value}
                          onClick={() => {
                            setCurrentMonth(new Date(o.value, month));
                            setYearMenuOpen(false);
                          }}
                          className={[
                            "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition",
                            year === o.value ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {year === o.value ? (
                            <svg className="h-3 w-3 shrink-0 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <span className="h-3 w-3 shrink-0" />
                          )}
                          {o.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setCurrentMonth(new Date(year, month + 1));
                setMonthMenuOpen(false);
                setYearMenuOpen(false);
              }}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <div key={day} className="text-center text-xs font-semibold text-slate-500 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }

              const dateStr = toDateString(year, month, day);
              const inRange = isDateInRange(dateStr);
              const isStart = isDateStart(dateStr);
              const isEnd = isDateEnd(dateStr);
              const isToday = dateStr === new Date().toISOString().split("T")[0];
              const isPast = isPastDate(dateStr);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    if (!isPast) handleDateClick(dateStr);
                  }}
                  onMouseEnter={() => {
                    if (!isPast) setHoverDate(dateStr);
                  }}
                  onMouseLeave={() => setHoverDate(null)}
                  disabled={isPast}
                  className={`
                    aspect-square rounded-xl text-sm font-semibold transition
                    ${
                      isPast
                        ? "cursor-not-allowed bg-slate-50 text-slate-300"
                        : isStart || isEnd
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : inRange
                          ? "bg-blue-50 text-slate-900 hover:bg-blue-100"
                          : "text-slate-700 hover:bg-slate-100"
                    }
                    ${isToday && !isStart && !isEnd ? "ring-2 ring-blue-400" : ""}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-col gap-3" onClick={() => { if (tzOpen) setTzOpen(false); }}>
            {/* Timezone picker */}
            {onTimezoneChange && timezoneOptions && (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-semibold text-slate-600">Time Zone</span>
                <button
                  type="button"
                  onClick={() => { setTzOpen(!tzOpen); setTzSearch(""); }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white"
                >
                  {selectedTzLabel || "Select timezone"}
                  <svg className="absolute right-3 top-1/2 translate-y-0.5 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {tzOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-hidden flex flex-col">
                    <div className="p-1.5 border-b border-slate-100">
                      <input
                        type="text"
                        value={tzSearch}
                        onChange={(e) => setTzSearch(e.target.value)}
                        placeholder="Search timezone..."
                        autoFocus
                        className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-blue-400 focus:bg-white"
                      />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {filteredTzOptions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-400">No results</div>
                      ) : filteredTzOptions.map((tz) => (
                        <button
                          key={tz.value}
                          type="button"
                          onClick={() => { onTimezoneChange(tz.value); setTzOpen(false); setTzSearch(""); }}
                          className={[
                            "w-full text-left px-3 py-2 text-xs transition hover:bg-slate-50",
                            tz.value === timezone ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700",
                          ].join(" ")}
                        >
                          {tz.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Time pickers — enabled once timezone is selected */}
            {onStartTimeChange && onEndTimeChange && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Start Time</span>
                  <input
                    type="time"
                    value={startTime ?? "08:00"}
                    onChange={(e) => onStartTimeChange(e.target.value)}
                    disabled={!timezone}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white disabled:opacity-50"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">End Time</span>
                  <input
                    type="time"
                    value={endTime ?? "17:00"}
                    onChange={(e) => onEndTimeChange(e.target.value)}
                    disabled={!timezone}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white disabled:opacity-50"
                  />
                </label>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">
                {startDate && endDate ? (
                  <span className="text-slate-900 font-semibold">✓ {getDuration()} selected</span>
                ) : startDate ? (
                  <span className="text-amber-700 font-semibold">Select end date</span>
                ) : (
                  <span>Select start date</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StepIcon({ step }: { step: (typeof import("./audit-form-shared"))["steps"][number] }) {
  if ("iconPaths" in step) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor">
        {step.iconPaths.map((d, i) => (
          <path key={i} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={d} />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={step.icon} />
    </svg>
  );
}
