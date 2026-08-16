"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { type ShellUser, Avatar, NavItem } from "@/components/shell-helpers";
import { AuditNavProvider } from "@/components/audit-nav-context";
import { AuditSidebarItems } from "@/components/audit-sidebar-items";
import NotificationBell from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function AdminShell({
  user,
  children,
  appLogo,
  pendingAccessRequests = 0,
  canAccessRegulatoryImplementation = false,
}: {
  user: ShellUser;
  children: React.ReactNode;
  appLogo?: string | null;
  pendingAccessRequests?: number;
  canAccessRegulatoryImplementation?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [changedRole, setChangedRole] = useState<string | null>(null);
  const [deactivated, setDeactivated] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/me/role");
        if (!res.ok) return;
        const data = await res.json() as { role: string; isActive: boolean };
        if (data.isActive === false) { setDeactivated(true); return; }
        if (data.role === "USER") setChangedRole("User");
        if (data.role === "AUDIT_OWNER") setChangedRole("Audit Owner");
      } catch {
        // network error — ignore
      }
    };
    const es = new EventSource("/api/stream/me");
    es.onmessage = (e) => { if (e.data === "role") void check(); };
    return () => es.close();
  }, []);

  return (
    <AuditNavProvider>
      {deactivated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl bg-white dark:bg-slate-800 p-8 shadow-2xl text-center">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">Account Deactivated</h2>
            <p className="mb-6 text-slate-500 dark:text-slate-400">
              Your account has been deactivated. Please contact your administrator to regain access.
            </p>
            <button
              onClick={() => {
                const qs = new URLSearchParams({
                  email: user.email ?? "",
                  name: user.name ?? "",
                }).toString();
                void signOut({ callbackUrl: `/request-access?${qs}` });
              }}
              className="w-full rounded-xl bg-slate-900 dark:bg-slate-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 dark:hover:bg-slate-600"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
      {changedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl bg-white dark:bg-slate-800 p-8 shadow-2xl text-center">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">Role Changed</h2>
            <p className="mb-6 text-slate-500 dark:text-slate-400">
              Your role has been changed to <span className="font-semibold text-slate-700 dark:text-slate-200">{changedRole}</span>. Please sign out and log in again to continue with your updated permissions.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => void signOut({ callbackUrl: "/login" })}
                className="rounded-xl bg-slate-900 dark:bg-slate-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 dark:hover:bg-slate-600"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    <div
      className={`min-h-screen bg-slate-50 dark:bg-slate-900 transition-[padding-left] duration-300 ${
        sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"
      }`}
    >
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`print:hidden fixed inset-y-0 left-0 z-40 flex flex-col bg-slate-900 text-white transition-all duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 ${sidebarCollapsed ? "w-16" : "w-64"}`}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="absolute -right-3 top-14 z-40 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:bg-slate-100 hover:text-slate-900 lg:flex"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand" : "Collapse"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            {sidebarCollapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            )}
          </svg>
        </button>

        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center border-b border-slate-700/60 px-3">
          <div className="flex min-w-0 flex-1 items-center">
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="shrink-0 cursor-pointer"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <img
                src={appLogo ?? "/favicon.ico"}
                alt="App Logo"
                className="h-10 w-10 object-contain"
              />
            </button>
            {!sidebarCollapsed && (
              <Link href="/adminDashboard" className="ml-3 flex-1 truncate text-sm font-semibold tracking-tight text-slate-300 hover:text-white transition-colors">
                Audit Tool
              </Link>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className={`rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white lg:hidden ${
              sidebarCollapsed ? "ml-auto" : "ml-2"
            }`}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-4">
          {!sidebarCollapsed && (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Main
            </p>
          )}
          <NavItem
            href="/adminDashboard"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            }
            label="Dashboard"
            active={pathname === "/adminDashboard"}
            collapsed={sidebarCollapsed}
          />
          <NavItem
            href="/adminDashboard/allAudits"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            }
            label="All Audits"
            active={pathname === "/adminDashboard/allAudits"}
            collapsed={sidebarCollapsed}
            newTab
          />
          <NavItem
            href="/adminDashboard/allRequests"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            label="All Requests"
            active={pathname === "/adminDashboard/allRequests"}
            collapsed={sidebarCollapsed}
            newTab
          />
          <NavItem
            href="/adminDashboard/createAudit"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
            label="Create Audit"
            active={pathname.startsWith("/adminDashboard/createAudit")}
            collapsed={sidebarCollapsed}
          />
          <NavItem
            href="/adminDashboard/auditPlan"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            label="Annual Internal Audit Plan"
            active={pathname.startsWith("/adminDashboard/auditPlan")}
            collapsed={sidebarCollapsed}
            newTab
          />
          <NavItem
            href="/adminDashboard/riskAssessments"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            }
            label="Annual Internal Audit Risk Assessments"
            active={pathname.startsWith("/adminDashboard/riskAssessments")}
            collapsed={sidebarCollapsed}
            newTab
          />
          <NavItem
            href="/adminDashboard/sirt"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
            }
            label="Site Investigation Response Team (SIRT)"
            active={pathname.startsWith("/adminDashboard/sirt")}
            collapsed={sidebarCollapsed}
            newTab
          />
          {canAccessRegulatoryImplementation && (
            <NavItem
              href="/adminDashboard/regulatoryImplementation"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 0l-5 9a4 4 0 008 0l-5-9zm0 0l5 9a4 4 0 01-8 0l5-9zm0 0v14m-6 0h12" />
                </svg>
              }
              label="Regulatory Implementation of Lessons Learned"
              active={pathname.startsWith("/adminDashboard/regulatoryImplementation")}
              collapsed={sidebarCollapsed}
              newTab
            />
          )}
          <AuditSidebarItems collapsed={sidebarCollapsed} dashboardBase="/adminDashboard" isAdmin />

          {!sidebarCollapsed && (
            <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Management
            </p>
          )}
          {sidebarCollapsed && <div className="my-3 border-t border-slate-700/60" />}
          <NavItem
            href="/adminDashboard/users"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-2 0" />
              </svg>
            }
            label="Users"
            collapsed={sidebarCollapsed}
            active={pathname.startsWith("/adminDashboard/users")}
            newTab
          />

          <div className="group relative">
            <Link
              href="/adminDashboard/accessRequests"
              title={sidebarCollapsed ? "Access Requests" : undefined}
              className={`flex items-center rounded-xl px-2.5 py-2.5 text-sm font-medium transition ${
                sidebarCollapsed ? "justify-center" : "gap-3 pr-8"
              } ${
                pathname.startsWith("/adminDashboard/accessRequests")
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="relative shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                {pendingAccessRequests > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                    {pendingAccessRequests > 9 ? "9+" : pendingAccessRequests}
                  </span>
                )}
              </span>
              {!sidebarCollapsed && (
                <span className="min-w-0 flex-1 leading-snug">
                  Access Requests
                  {pendingAccessRequests > 0 && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                      {pendingAccessRequests}
                    </span>
                  )}
                </span>
              )}
            </Link>
            {!sidebarCollapsed && (
              <a
                href="/adminDashboard/accessRequests"
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

          <NavItem
            href="/adminDashboard/requestStatuses"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            }
            label="Request Statuses"
            active={pathname.startsWith("/adminDashboard/requestStatuses")}
            collapsed={sidebarCollapsed}
            newTab
          />
          <NavItem
            href="/adminDashboard/appLogo"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            label="App Logo"
            active={pathname.startsWith("/adminDashboard/appLogo")}
            collapsed={sidebarCollapsed}
            newTab
          />
          <NavItem
            href="/adminDashboard/feedback"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            }
            label="Feedback"
            active={pathname.startsWith("/adminDashboard/feedback")}
            collapsed={sidebarCollapsed}
            newTab
          />
        </nav>

        {/* Bottom actions */}
        <div className="shrink-0 border-t border-slate-700/60 px-2 py-3">
          <div className="group relative">
            <Link
            href="/adminDashboard/profile"
            title={sidebarCollapsed ? "Profile" : undefined}
            className={`flex items-center overflow-hidden rounded-xl px-2.5 py-2.5 text-sm font-medium transition ${
              sidebarCollapsed ? "justify-center" : "gap-3"
            } ${
              pathname.startsWith("/adminDashboard/profile")
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-600">
              <Avatar name={user.name} src={user.image} textSize="text-[9px]" />
            </span>
            {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate">Profile</span>}
          </Link>
          {!sidebarCollapsed && (
            <a
              href="/adminDashboard/profile"
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
          <button
            onClick={() => void signOut({ callbackUrl: "/login" })}
            title={sidebarCollapsed ? "Sign Out" : undefined}
            className={`mt-1 flex w-full items-center rounded-xl px-2.5 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white ${
              sidebarCollapsed ? "justify-center" : "gap-3"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
            {!sidebarCollapsed && "Sign Out"}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="print:hidden sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-700/60 bg-slate-900 px-4 shadow-sm lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          aria-label="Open menu"
        >
          ☰
        </button>
        <img
          src={appLogo ?? "/favicon.ico"}
          alt="App Logo"
          className="h-8 w-8 object-contain"
        />
        <span className="font-semibold text-white">Audit Management Tool</span>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>

      {/* Desktop notification bell + theme toggle */}
      <div className="fixed right-6 top-4 z-20 hidden lg:flex lg:items-center lg:gap-1">
        <ThemeToggle />
        <NotificationBell />
      </div>

      {/* Page content */}
      <div className="pb-16">{children}</div>

      {/* Footer */}
      <footer className={`print:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-4 transition-all duration-300 ${sidebarCollapsed ? "lg:left-16" : "lg:left-64"}`}>
        <div className="flex items-center justify-center gap-3">
          <img src="/Philips_logo.png" alt="Philips" className="h-6 w-auto object-contain opacity-70" />
          <span className="text-xs font-medium text-slate-400">© {new Date().getFullYear()} Philips Medical Systems Technologies Ltd (Israel) · For internal use only · Developed by CT/AMI Business - QMS-0014</span>
        </div>
      </footer>
    </div>
    </AuditNavProvider>
  );
}
