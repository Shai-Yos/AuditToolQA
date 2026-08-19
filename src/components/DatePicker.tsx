"use client";

import { useState, useRef, useEffect } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder,
  name,
}: {
  value: string; // YYYY-MM-DD or ""
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
}) {
  const today = new Date();
  const parsed = value ? new Date(value + "T12:00:00") : null;

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null) as null[],
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const select = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${viewYear}-${mm}-${dd}`);
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const isSelected = (day: number) =>
    !!parsed &&
    day === parsed.getDate() &&
    viewMonth === parsed.getMonth() &&
    viewYear === parsed.getFullYear();

  const isPast = (day: number) =>
    new Date(viewYear, viewMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const displayValue = parsed
    ? `${parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} UTC`
    : "";

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={value} />}

      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (parsed) { setViewYear(parsed.getFullYear()); setViewMonth(parsed.getMonth()); }
          setOpen((o) => !o);
        }}
        className={[
          "w-full flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm text-left transition",
          "disabled:cursor-not-allowed disabled:opacity-60",
          open
            ? "border-blue-400 bg-white ring-4 ring-blue-100 shadow-sm"
            : value
              ? "border-blue-200 bg-blue-50 hover:border-blue-300 hover:shadow-sm"
              : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
        ].join(" ")}
      >
        <svg
          className={`h-4 w-4 shrink-0 transition ${value ? "text-blue-500" : "text-slate-400"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className={`flex-1 ${value ? "font-semibold text-blue-900" : "text-slate-400"}`}>
          {displayValue || (placeholder ?? "Pick a date…")}
        </span>
        {value && !disabled ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="rounded-md p-0.5 text-blue-400 transition hover:bg-blue-100 hover:text-blue-700 cursor-pointer"
            title="Clear"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        ) : (
          <svg className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180 text-blue-400" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Calendar dropdown */}
      {open && !disabled && (
        <div className="absolute z-50 mt-2 w-[272px] rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5">
          {/* Month navigation */}
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-bold text-slate-800">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day names */}
          <div className="grid grid-cols-7 border-y border-slate-100 px-3 py-2">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5 px-3 py-3">
            {cells.map((day, i) => (
              <div key={i} className="flex items-center justify-center">
                {day ? (
                  <button
                    type="button"
                    onClick={() => select(day)}
                    className={[
                      "h-8 w-8 rounded-full text-sm transition",
                      isSelected(day)
                        ? "bg-blue-600 font-bold text-white shadow-sm"
                        : isToday(day)
                          ? "bg-blue-50 font-bold text-blue-700 ring-2 ring-blue-300 hover:bg-blue-100"
                          : isPast(day)
                            ? "font-normal text-slate-400 hover:bg-slate-100"
                            : "font-medium text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {day}
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
            <button
              type="button"
              onClick={() => {
                setViewYear(today.getFullYear());
                setViewMonth(today.getMonth());
                const mm = String(today.getMonth() + 1).padStart(2, "0");
                const dd = String(today.getDate()).padStart(2, "0");
                onChange(`${today.getFullYear()}-${mm}-${dd}`);
                setOpen(false);
              }}
              className="text-xs font-semibold text-blue-600 transition hover:text-blue-800"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="text-xs font-semibold text-slate-400 transition hover:text-red-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
