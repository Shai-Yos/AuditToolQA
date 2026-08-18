"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useAuditNav } from "./audit-nav-context";
import ExportModal, { type ExportType } from "@/app/adminDashboard/audits/[auditId]/_components/ExportModal";

export function AuditSidebarItems({
  collapsed,
  dashboardBase,
  isAdmin = false,
  isAuditOwner = false,
}: {
  collapsed: boolean;
  dashboardBase: string;
  isAdmin?: boolean;
  isAuditOwner?: boolean;
}) {
  const { activeAudit } = useAuditNav();
  const pathname = usePathname();
  if (!activeAudit) return null;

  const base = `${dashboardBase}/audits/${activeAudit.id}`;
  const currentTab = activeAudit.tab;
  const isOnNewRequest = pathname.startsWith(`${base}/requests/new`);
  const isOnEditAudit = pathname.startsWith(`/adminDashboard/editAudit/${activeAudit.id}`) || pathname.startsWith(`/auditOwnerDashboard/editAudit/${activeAudit.id}`);
  const isOnChats = pathname.startsWith(`${base}/chats`);
  const isOnKanban = pathname.startsWith(`${base}/kanbanBoard`);
  const isOnAssignees = pathname.startsWith(`${base}/assignees`);
  const isOnDashboard = pathname === base;

  // Pick a return tab for the standalone /requests/new page based on the current URL.
  const returnTabForNew = (() => {
    if (isOnNewRequest) return "requests"; // came directly
    if (isOnChats) return "chats";
    if (isOnKanban) return "kanbanBoard";
    if (isOnAssignees) return "assignees";
    if (isOnDashboard) return "home";
    return "requests";
  })();
  const newRequestHref = `${base}/requests/new?tab=${encodeURIComponent(returnTabForNew)}`;

  const items = [
    { tab: "dashboard", label: "Audit Home", icon: DashboardIcon },
    { tab: "chat", label: "Chats", icon: ChatIcon },
    { tab: "kanban", label: "Board", icon: KanbanIcon },
    { tab: "assignees", label: "Assignees", icon: AssigneesIcon },
    { tab: "requests", label: "Requests", icon: RequestsIcon },
  ];

  return (
    <>
      <div className="my-2 border-t border-slate-700/60" />
      {!collapsed && (
        <div className="mb-1 px-3 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Current Audit
          </p>
        </div>
      )}
      {items.map(({ tab, label, icon: Icon }) => {
        const href = tab === "dashboard"
          ? base
          : tab === "chat"
          ? `${base}/chats`
          : tab === "kanban"
          ? `${base}/kanbanBoard`
          : tab === "requests"
          ? `${base}/requests`
          : tab === "assignees"
          ? `${base}/assignees`
          : `${base}?tab=${tab}`;
        const isOnRequests = pathname.startsWith(`${base}/requests`) && !isOnNewRequest;
        const isActive = tab === "dashboard"
          ? isOnDashboard
          : tab === "chat"
          ? isOnChats
          : tab === "kanban"
          ? isOnKanban
          : tab === "requests"
          ? isOnRequests
          : tab === "assignees"
          ? isOnAssignees
          : currentTab === tab && !isOnNewRequest && !isOnEditAudit && !isOnChats && !isOnKanban && !isOnAssignees && !isOnDashboard;
        return (
        <div key={tab} className="group relative flex items-center">
          <Link
            href={href}
            title={collapsed ? label : undefined}
            className={[
              "flex flex-1 items-center overflow-hidden rounded-xl px-2.5 py-2.5 text-sm font-medium transition",
              collapsed ? "justify-center" : "gap-3 pl-7",
              isActive
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white",
            ].join(" ")}
          >
            <span className="relative shrink-0">
              <Icon className="h-4 w-4" />
            </span>
            {!collapsed && label}
          </Link>
          {!collapsed && (
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${label} in new tab`}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 opacity-0 transition hover:bg-slate-600 hover:text-white group-hover:opacity-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          )}
        </div>
        );
      })}

      {/* Active Request sub-item */}
      {activeAudit?.activeRequestId && !collapsed && (
        <div className="group relative flex items-center">
          <Link
            href={`${base}/requests/${activeAudit.activeRequestId}`}
            className={[
              "flex flex-1 items-center overflow-hidden rounded-xl px-2.5 py-2 text-xs font-medium transition",
              "gap-2 pl-11",
              pathname.includes(activeAudit.activeRequestId)
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white",
            ].join(" ")}
            title={activeAudit.activeRequestTitle}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="truncate">{activeAudit.activeRequestTitle}</span>
          </Link>
        </div>
      )}

      {/* New Request shortcut */}
      {(isAdmin || isAuditOwner || activeAudit?.canCreateRequest) && (
      <div className="group relative flex items-center">
        <Link
          href={newRequestHref}
          title={collapsed ? "New Request" : undefined}
          className={[
            "flex flex-1 items-center overflow-hidden rounded-xl px-2.5 py-2.5 text-sm font-medium transition",
            collapsed ? "justify-center" : "gap-3 pl-7",
            isOnNewRequest && !isOnEditAudit
              ? "bg-slate-800 text-white"
              : "text-slate-400 hover:bg-slate-800 hover:text-white",
          ].join(" ")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {!collapsed && "New Request"}
        </Link>
        {!collapsed && (
          <Link
            href={newRequestHref}
            target="_blank"
            rel="noopener noreferrer"
            title="Open New Request in new tab"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 opacity-0 transition hover:bg-slate-600 hover:text-white group-hover:opacity-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        )}
      </div>
      )}

      {/* Edit Audit — admin or audit owner (own audits) only */}
      {(isAdmin || isAuditOwner) && (() => {
        const editHref = isAdmin
          ? `/adminDashboard/editAudit/${activeAudit.id}`
          : `/auditOwnerDashboard/editAudit/${activeAudit.id}`;
        return (
        <div className="group relative flex items-center">
          <Link
            href={editHref}
            title={collapsed ? "Edit Audit" : undefined}
            className={[
              "flex flex-1 items-center overflow-hidden rounded-xl px-2.5 py-2.5 text-sm font-medium transition",
              collapsed ? "justify-center" : "gap-3 pl-7",
              isOnEditAudit
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white",
            ].join(" ")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {!collapsed && "Edit Audit"}
          </Link>
          {!collapsed && (
            <Link
              href={editHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Edit Audit in new tab"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 opacity-0 transition hover:bg-slate-600 hover:text-white group-hover:opacity-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          )}
        </div>
        );
      })()}

      {/* Export Audit — admin or audit owner only */}
      {(isAdmin || isAuditOwner) && (
        <ExportAuditButton auditId={activeAudit.id} auditTitle={activeAudit.title} collapsed={collapsed} />
      )}
      <div className="my-2 border-t border-slate-700/60" />
    </>
  );
}

function ExportAuditButton({ auditId, auditTitle, collapsed }: { auditId: string; auditTitle: string; collapsed: boolean }) {
  const [exporting, setExporting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleConfirm = async (type: ExportType) => {
    setShowModal(false);
    setExporting(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/export?type=${type}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = auditTitle.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || auditId;
      a.download = type === "zip" ? `${safeName}_export.zip` : `${safeName}_export.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {showModal && createPortal(
        <ExportModal
          auditTitle={auditTitle}
          onConfirm={handleConfirm}
          onClose={() => setShowModal(false)}
        />,
        document.body
      )}
      <div className="group relative flex items-center">
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={exporting}
          title={collapsed ? "Export Audit" : undefined}
          className={[
            "flex flex-1 items-center overflow-hidden rounded-xl px-2.5 py-2.5 text-sm font-medium transition",
            collapsed ? "justify-center" : "gap-3 pl-7",
            "text-slate-400 hover:bg-slate-800 hover:text-white",
            exporting ? "opacity-50 cursor-wait" : "",
          ].join(" ")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          {!collapsed && (exporting ? "Exporting..." : "Export Audit")}
        </button>
      </div>
    </>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function RequestsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function KanbanIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-2 0"
      />
    </svg>
  );
}

function AssigneesIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

