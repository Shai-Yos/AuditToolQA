"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuditNav } from "@/components/audit-nav-context";
import { NewRequestModal } from "@/components/new-request-modal";

type User = { id: string; name: string; roles: string[]; image?: string | null };

function getRoleBadgeClass(isFR: boolean, roleLabel: string) {
  const r = roleLabel.toLowerCase();
  if (isFR) {
    if (r.includes("lead")) return "bg-blue-100 text-blue-800 border border-blue-200";
    if (r.includes("qm")) return "bg-indigo-100 text-indigo-800 border border-indigo-200";
    if (r.includes("sme")) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
    if (r.includes("transcriptionist")) return "bg-sky-100 text-sky-800 border border-sky-200";
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }
  if (r.includes("lead")) return "bg-indigo-100 text-indigo-800 border border-indigo-200";
  if (r.includes("qm")) return "bg-violet-100 text-violet-800 border border-violet-200";
  if (r.includes("quality")) return "bg-purple-100 text-purple-800 border border-purple-200";
  if (r.includes("sme")) return "bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200";
  if (r.includes("caller")) return "bg-pink-100 text-pink-800 border border-pink-200";
  if (r.includes("outgoing")) return "bg-rose-100 text-rose-800 border border-rose-200";
  if (r.includes("incoming")) return "bg-orange-100 text-orange-800 border border-orange-200";
  if (r.includes("records")) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-violet-50 text-violet-700 ring-violet-200";
}

function initials(name: string) {
  const local = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  const cleaned = local.replace(/\(.*?\)/g, "").trim();
  const parts = cleaned.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return (
    ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?"
  );
}

function UserCard({
  name,
  image,
  roles,
  isFR,
}: {
  name: string;
  image?: string | null;
  roles: string[];
  isFR: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-300 dark:ring-slate-600">
        {image ? (
          <img src={image} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
            {initials(name)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 break-words">{name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {roles.map((role) => {
            const label = role.replace(/^(FR\d+|BR\d+)\s/, "");
            return (
              <span key={role} className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${getRoleBadgeClass(isFR, role)}`}>
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AssigneesUI({
  audit,
  currentUser,
  canCreateRequest = false,
}: {
  audit: { id: string; title: string; users: User[]; frontRoomsCount?: number };
  currentUser: { id: string; name: string; isAdmin: boolean };
  canCreateRequest?: boolean;
}) {
  const router = useRouter();
  const { setActiveAudit } = useAuditNav();
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [liveCanCreate, setLiveCanCreate] = useState(canCreateRequest);

  useEffect(() => {
    setActiveAudit({ id: audit.id, title: audit.title, tab: "participants", canCreateRequest: liveCanCreate });
    return () => setActiveAudit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id, audit.title, liveCanCreate]);

  // Poll roles every 5s so permission changes take effect without a page reload
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/audits/${audit.id}/assignment`);
        if (!res.ok) return;
        const data = (await res.json()) as { roles: string };
        if (data.roles !== undefined) {
          const can = /\bFR\d+\s+(Lead|QM)\b/i.test(data.roles) || /\bBR\d+\s+(Lead|QM)\b/i.test(data.roles);
          setLiveCanCreate(can);
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [audit.id]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-50 via-cyan-50/30 to-transparent" />
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="w-full text-center flex flex-col items-center">
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl w-full max-w-4xl break-words">
              {audit.title}
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
            {liveCanCreate && (
              <button
                type="button"
                onClick={() => setShowNewRequestModal(true)}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
              >
                + New Request
              </button>
            )}
          </div>
        </div>

        {/* Assignees */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Role Assignments</h2>
          </div>
          {(() => {
            const roomPattern = /^(FR\d+|BR\d+)\s/;
            const groups = new Map<string, typeof audit.users>();
            const ungrouped: typeof audit.users = [];

            for (const a of audit.users) {
              const match = roomPattern.exec(a.roles[0] ?? "");
              if (match?.[1]) {
                const key = match[1];
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(a);
              } else {
                ungrouped.push(a);
              }
            }

            const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
              const typeA = a.startsWith("FR") ? 0 : 1;
              const typeB = b.startsWith("FR") ? 0 : 1;
              if (typeA !== typeB) return typeA - typeB;
              return parseInt(a.slice(2)) - parseInt(b.slice(2));
            });

            if (sortedGroups.length === 0 && ungrouped.length === 0) {
              return (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500">
                  <div className="text-4xl mb-3 opacity-40">👥</div>
                  <p className="text-sm font-semibold">No users yet</p>
                  <p className="mt-1 text-xs">Role assignments will appear here once the audit is configured.</p>
                </div>
              );
            }

            return (
              <>
                {sortedGroups.map(([roomKey, members]) => {
                  const isFR = roomKey.startsWith("FR");
                  return (
                    <div key={roomKey}>
                      <div className="mb-3 flex items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${isFR ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                          {isFR ? "Front Room" : "Back Room"} {roomKey.slice(2)}
                        </span>
                        <span className="text-xs text-slate-400">{members.length} {members.length === 1 ? "person" : "people"}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {members.map((a) => {
                          return (
                            <UserCard
                              key={a.id}
                              name={a.name}
                              image={a.image}
                              roles={a.roles}
                              isFR={isFR}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {ungrouped.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-600">Participants</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {ungrouped.map((a) => {
                        return (
                          <UserCard
                            key={a.id}
                            name={a.name}
                            image={a.image}
                            roles={a.roles}
                            isFR={false}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* New Request Modal */}
      {liveCanCreate && showNewRequestModal && (
        <NewRequestModal
          auditId={audit.id}
          auditTitle={audit.title}
          frontRoomsCount={audit.frontRoomsCount ?? 1}
          onClose={() => setShowNewRequestModal(false)}
        />
      )}
    </main>
  );
}