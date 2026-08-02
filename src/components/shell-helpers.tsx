"use client";

import { useState } from "react";
import Link from "next/link";

export type ShellUser = { name: string; email?: string; role: string; image?: string };

export function getInitials(name: string) {
  const local = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  const cleaned = local.replace(/\(.*?\)/g, "").trim();
  const parts = cleaned.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return (
    ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?"
  );
}

export function Avatar({ name, src, textSize = "text-xs" }: { name: string; src?: string; textSize?: string }) {
  const [failed, setFailed] = useState(false);
  const inits = getInitials(name);
  if (!src || failed) {
    return (
      <span className={`flex h-full w-full items-center justify-center font-bold text-white ${textSize}`}>
        {inits}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function NavItem({
  href,
  icon,
  label,
  active,
  collapsed,
  newTab,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  newTab?: boolean;
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={`flex items-center rounded-xl px-2.5 py-2.5 text-sm font-medium transition ${
          collapsed ? "justify-center" : "gap-3"
        } ${newTab && !collapsed ? "pr-8" : ""} ${
          active
            ? "bg-slate-800 text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <span className="shrink-0">{icon}</span>
        {!collapsed && <span className="min-w-0 flex-1 leading-snug">{label}</span>}
      </Link>
      {newTab && !collapsed && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new tab"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 opacity-0 transition hover:bg-slate-700 hover:text-white group-hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )}
    </div>
  );
}
