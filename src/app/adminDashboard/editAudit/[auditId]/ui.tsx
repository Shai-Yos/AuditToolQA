﻿"use client";

import React, { useMemo, useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateAudit, type UpdateAuditInput } from "./actions";
import { useAuditNav } from "@/components/audit-nav-context";
import {
  type FRRoleAssignment,
  type BRRoleAssignment,
  type StepKey,
  type StatusColumnDraft,
  initialFormState,
  statusColors,
  steps,
  clamp,
  normalizeDateInput,
} from "@/components/audit-form/audit-form-shared";
import { RoomAssigner, CalendarDateRangePicker, StepIcon } from "@/components/audit-form/audit-form-components";

function formatDateForInput(date: Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type AuditData = {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
  startAt: Date | null;
  endAt: Date | null;
  timezone: string;
  frontRoomsCount: number;
  backRoomsCount: number;
  roomRolesJson: string | null;
  statusColumns: Array<{
    name: string;
    order: number;
    color: string;
  }>;
  existingUsers: Array<{ userId: string; name: string | null; email: string | null }>;
  initialFrRoles: FRRoleAssignment[];
  initialBrRoles: BRRoleAssignment[];
  initialStep?: StepKey;
};

export default function EditAuditForm({ audit, currentUserName }: { audit: AuditData; currentUserName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ ok: true; saved?: boolean } | { ok: false; error: string }>(initialFormState);

  // --- Editing lock ---
  const [lockState, setLockState] = useState<"checking" | "owned" | "blocked" | "error">("checking");
  const [lockOwner, setLockOwner] = useState<string | null>(null);

  useEffect(() => {
    let heartbeat: ReturnType<typeof setInterval>;
    let ownsLock = false;
    const lockUrl = `/api/audits/${audit.id}/lock`;

    const releaseLock = () => {
      if (!ownsLock) return;
      fetch(lockUrl, { method: "DELETE", keepalive: true }).catch(() => {});
    };

    const acquire = async () => {
      try {
        const res = await fetch(lockUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName: currentUserName }),
        });
        if (res.status === 409) {
          const data = (await res.json()) as { lockedByName?: string };
          setLockOwner(data.lockedByName ?? "Another user");
          setLockState("blocked");
          return;
        }
        if (!res.ok) {
          setLockState("error");
          return;
        }
        ownsLock = true;
        setLockState("owned");
        heartbeat = setInterval(() => {
          fetch(lockUrl, { method: "PATCH", keepalive: true }).catch(() => {});
        }, 10_000);
      } catch {
        setLockState("error");
      }
    };
    void acquire();

    window.addEventListener("beforeunload", releaseLock);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", releaseLock);
      releaseLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id]);

  // Refs for programmatic form submission
  const formRef = useRef<HTMLFormElement>(null);
  const noRedirectInputRef = useRef<HTMLInputElement>(null);
  const saveOnlyRef = useRef(false);

  // Save mode for button label feedback
  const [saveMode, setSaveMode] = useState<"save" | "final" | null>(null);

  // Toast state for successful save
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Detect successful save-only completion
  useEffect(() => {
    if (!pending && state.ok && (state as { ok: true; saved?: boolean }).saved) {
      setSavedAt(Date.now());
      setSaveMode(null);
    } else if (!pending) {
      setSaveMode(null);
    }
  }, [pending, state]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  function buildInput(noRedirectVal: string): UpdateAuditInput {
    return {
      title,
      description,
      status: auditStatus,
      startAt: startAtIso,
      endAt: endAtIso,
      timezone,
      frontRoomsCount,
      backRoomsCount,
      statusColumnsJson,
      roomRolesJson,
      userMetaJson: JSON.stringify(userLabels),
      noRedirect: noRedirectVal,
    };
  }

  function handleSave() {
    saveOnlyRef.current = true;
    setSaveMode("save");
    startTransition(async () => {
      const result = await updateAudit(audit.id, state, buildInput("true"));
      setState(result);
    });
  }

  function handleFinalSubmit() {
    saveOnlyRef.current = false;
    setSaveMode("final");
    startTransition(async () => {
      const result = await updateAudit(audit.id, state, buildInput(""));
      setState(result);
    });
  }

  const { setActiveAudit } = useAuditNav();
  useEffect(() => {
    setActiveAudit({ id: audit.id, title: audit.title, tab: "requests" });
    return () => setActiveAudit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id, audit.title]);

  const [step, setStep] = useState<StepKey>(audit.initialStep ?? "basic");
  const [maxStepReached, setMaxStepReached] = useState<number>(() => {
    const targetIdx = steps.findIndex((s) => s.key === (audit.initialStep ?? "basic"));
    return targetIdx >= 0 ? targetIdx : 5;
  });

  const [title, setTitle] = useState(audit.title);
  const [description, setDescription] = useState(audit.description || "");
  const [auditStatus, setAuditStatus] = useState<"DRAFT" | "ACTIVE" | "COMPLETED">(
    audit.status
  );

  const [startDate, setStartDate] = useState(formatDateForInput(audit.startAt));
  const [endDate, setEndDate] = useState(formatDateForInput(audit.endAt));
  const [startTime, setStartTime] = useState(() => {
    if (!audit.startAt) return "08:00";
    const d = new Date(audit.startAt);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [endTime, setEndTime] = useState(() => {
    if (!audit.endAt) return "17:00";
    const d = new Date(audit.endAt);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [timezone, setTimezone] = useState(audit.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  const [frontRoomsCount, setFrontRoomsCount] = useState<number>(audit.frontRoomsCount || 1);
  const [backRoomsCount, setBackRoomsCount] = useState<number>(audit.backRoomsCount || 1);

  const [frRoles, setFrRoles] = useState<FRRoleAssignment[]>(audit.initialFrRoles);
  const [brRoles, setBrRoles] = useState<BRRoleAssignment[]>(audit.initialBrRoles);
  const [userLabels, setUserLabels] = useState<Record<string, { name: string; image?: string; email?: string }>>(() => {
    const map: Record<string, { name: string; image?: string }> = {};
    audit.existingUsers.forEach((u) => {
      map[u.userId] = { name: u.name ?? u.email ?? u.userId };
    });
    return map;
  });

  const [statusColumns, setStatusColumns] = useState<StatusColumnDraft[]>(
    audit.statusColumns.length > 0
      ? audit.statusColumns.map((col) => ({
          name: col.name,
          order: col.order,
          color: col.color,
        }))
      : [
          { name: "Incoming", order: 1, color: statusColors[0]!.value },
          { name: "WIP", order: 2, color: statusColors[1]!.value },
          { name: "Doc. Review", order: 3, color: statusColors[2]!.value },
          { name: "Record Prep", order: 4, color: statusColors[3]!.value },
          { name: "Ready for FR", order: 5, color: statusColors[4]!.value },
          { name: "In FR", order: 6, color: statusColors[5]!.value },
          { name: "Closed", order: 7, color: statusColors[6]!.value },
          { name: "Cancelled", order: 8, color: statusColors[7]!.value },
          { name: "On Hold", order: 9, color: statusColors[8]!.value },
        ]
  );

  React.useEffect(() => {
    setFrontRoomsCount((n) => clamp(n, 1, 50));
  }, [frontRoomsCount]);

  React.useEffect(() => {
    setBackRoomsCount((n) => clamp(n, 1, 50));
  }, [backRoomsCount]);

  React.useEffect(() => {
    setFrRoles((prev) => {
      const next = Array.from({ length: frontRoomsCount }, (_, i) => {
        const existing = prev.find((r) => r.frIndex === i + 1);
        return existing ?? { frIndex: i + 1, leadUserIds: [], qmUserIds: [], smeUserIds: [], transcriptionUserIds: [] };
      });
      return next;
    });
  }, [frontRoomsCount]);

  React.useEffect(() => {
    setBrRoles((prev) => {
      const next = Array.from({ length: backRoomsCount }, (_, i) => {
        const existing = prev.find((r) => r.brIndex === i + 1);
        return existing ?? { brIndex: i + 1, leadUserIds: [], callerUserIds: [], qmUserIds: [], qualityReviewerUserIds: [], smePrepUserIds: [], outgoingUserIds: [], incomingUserIds: [], recordsPrepUserIds: [], connectedFrIndices: [] };
      });
      return next;
    });
  }, [backRoomsCount]);

  const stepIndex = useMemo(() => steps.findIndex((s) => s.key === step), [step]);

  const canGoNext = useMemo(() => {
    if (step === "basic") return title.trim().length > 0 && description.trim().length > 0;
    if (step === "rooms") return frontRoomsCount >= 1 && backRoomsCount >= 1;
    if (step === "connections") return true;
    if (step === "users") return true;
    if (step === "status") {
      return statusColumns.length >= 1 && statusColumns.every((c) => c.name.trim().length > 0);
    }
    return true;
  }, [step, title, description, frontRoomsCount, backRoomsCount, statusColumns]);

  const canAccessStep = useMemo(() => {
    return {
      basic: true,
      rooms: true,
      connections: true,
      users: true,
      status: true,
      review: true,
    };
  }, []);

  function goNext() {
    if (!canGoNext) return;
    const nextIdx = clamp(stepIndex + 1, 0, steps.length - 1);
    const nextStep = steps[nextIdx];
    if (nextStep) {
      setStep(nextStep.key);
      setMaxStepReached(Math.max(maxStepReached, nextIdx));
    }
  }

  function goPrev() {
    const prevIdx = clamp(stepIndex - 1, 0, steps.length - 1);
    const prevStep = steps[prevIdx];
    if (prevStep) setStep(prevStep.key);
  }

  function handleDragStart(idx: number) {
    setDraggedIndex(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === idx) return;

    setStatusColumns((prev) => {
      const next = [...prev];
      const [item] = next.splice(draggedIndex, 1);
      if (!item) return prev;
      next.splice(idx, 0, item);
      return next.map((c, i) => ({ ...c, order: i + 1 }));
    });

    setDraggedIndex(idx);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
  }

  function removeStatus(i: number) {
    setStatusColumns((prev) => prev.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, order: idx + 1 })));
  }

  function addStatus(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStatusColumns((prev) => {
      const usedColors = new Set(prev.map((c) => c.color));
      const availableColor = statusColors.find((sc) => !usedColors.has(sc.value));
      const defaultColor = availableColor ? availableColor.value : statusColors[prev.length % statusColors.length]!.value;
      const next = [...prev, { name: trimmed, order: prev.length + 1, color: defaultColor }];
      return next;
    });
  }

  const [newColumnName, setNewColumnName] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingStatusIdx, setEditingStatusIdx] = useState<number | null>(null);
  const [editingStatusName, setEditingStatusName] = useState("");

  function startEditStatus(idx: number) {
    setEditingStatusIdx(idx);
    setEditingStatusName(statusColumns[idx]!.name);
  }
  function commitEditStatus() {
    if (editingStatusIdx === null) return;
    setStatusColumns((prev) =>
      prev.map((c, i) => (i === editingStatusIdx ? { ...c, name: editingStatusName.trim() || c.name } : c)),
    );
    setEditingStatusIdx(null);
  }

  const usersAssignedCount = useMemo(() => {
    const setIds = new Set<string>();
    for (const fr of frRoles) {
      fr.leadUserIds.forEach((id) => setIds.add(id));
      fr.qmUserIds.forEach((id) => setIds.add(id));
      (fr.smeUserIds || []).forEach((id) => setIds.add(id));
      fr.transcriptionUserIds.forEach((id) => setIds.add(id));
      (fr.customRoles || []).forEach((cr) => cr.userIds.forEach((id) => setIds.add(id)));
    }
    for (const br of brRoles) {
      br.leadUserIds.forEach((id) => setIds.add(id));
      br.callerUserIds.forEach((id) => setIds.add(id));
      (br.qmUserIds || []).forEach((id) => setIds.add(id));
      (br.qualityReviewerUserIds || []).forEach((id) => setIds.add(id));
      (br.smePrepUserIds || []).forEach((id) => setIds.add(id));
      br.outgoingUserIds.forEach((id) => setIds.add(id));
      br.incomingUserIds.forEach((id) => setIds.add(id));
      br.recordsPrepUserIds.forEach((id) => setIds.add(id));
      (br.customRoles || []).forEach((cr) => cr.userIds.forEach((id) => setIds.add(id)));
    }
    return setIds.size;
  }, [frRoles, brRoles]);

  const statusColumnsJson = useMemo(
    () => JSON.stringify(statusColumns.map((c, idx) => ({ name: c.name.trim(), order: idx + 1, color: c.color }))),
    [statusColumns]
  );
  const roomRolesJson = useMemo(() => JSON.stringify({
    fr: frRoles.map(({ frIndex, leadUserIds, qmUserIds, smeUserIds, transcriptionUserIds, customRoles }) => ({ frIndex, leadUserIds, qmUserIds, smeUserIds, transcriptionUserIds, customRoles: customRoles || [] })),
    br: brRoles.map(({ brIndex, leadUserIds, callerUserIds, qmUserIds, qualityReviewerUserIds, smePrepUserIds, outgoingUserIds, incomingUserIds, recordsPrepUserIds, connectedFrIndices, customRoles }) => ({ brIndex, leadUserIds, callerUserIds, qmUserIds: qmUserIds || [], qualityReviewerUserIds: qualityReviewerUserIds || [], smePrepUserIds: smePrepUserIds || [], outgoingUserIds, incomingUserIds, recordsPrepUserIds, connectedFrIndices, customRoles: customRoles || [] })),
  }), [frRoles, brRoles]);

  const startAtIso = useMemo(() => {
    const d = normalizeDateInput(startDate);
    if (!d) return "";
    return `${d.slice(0, 10)}T${startTime}:00`;
  }, [startDate, startTime]);
  const endAtIso = useMemo(() => {
    const d = normalizeDateInput(endDate);
    if (!d) return "";
    return `${d.slice(0, 10)}T${endTime}:00`;
  }, [endDate, endTime]);

  const timezoneOptions = useMemo(() => {
    const now = new Date();
    return Intl.supportedValuesOf("timeZone").map((tz) => {
      const offset = (new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value ?? "").replace("GMT", "UTC");
      return { value: tz, label: `(${offset}) ${tz.replace(/_/g, " ")}` };
    });
  }, []);

  // Lock gate: show checking / blocked / error states
  if (lockState === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <svg className="h-8 w-8 animate-spin text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm font-medium text-slate-600">Opening audit editor...</p>
        </div>
      </main>
    );
  }

  if (lockState === "blocked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-10 shadow-sm text-center">
          <span className="text-4xl">🔒</span>
          <h2 className="text-lg font-semibold text-amber-900">Editing Locked</h2>
          <p className="text-sm text-amber-800">
            <strong>{lockOwner}</strong> is currently editing this audit. You can still view it, but editing is unavailable until they finish.
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-2 inline-flex items-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            ← Go Back
          </button>
        </div>
      </main>
    );
  }

  if (lockState === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-10 shadow-sm text-center">
          <span className="text-4xl">⚠️</span>
          <h2 className="text-lg font-semibold text-red-900">Unable to acquire lock</h2>
          <p className="text-sm text-red-800">Something went wrong while trying to lock this audit for editing.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 inline-flex items-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* subtle dashboard wash */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col items-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{audit.title}</h1>
            <p className="mt-1 text-sm text-slate-600">Update the audit configuration below.</p>
          </div>

          <button
            type="button"
            onClick={() => router.back()}
            className="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            ← Back
          </button>
        </div>

        {/* Stepper */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-slate-900 transition-all"
              style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="mt-5 grid grid-cols-6 gap-2">
            {steps.map((s, idx) => {
              const done = idx < stepIndex;
              const active = idx === stepIndex;
              const isClickable = true;
              const canAccess = canAccessStep[s.key];

              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => isClickable && setStep(s.key)}
                  disabled={!isClickable}
                  className={[
                    "group flex flex-col items-center gap-2 rounded-xl px-2 py-3 transition",
                    isClickable ? "hover:bg-slate-50 cursor-pointer" : "cursor-default opacity-40",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "flex h-10 w-10 items-center justify-center rounded-full ring-1 transition",
                      done ? "bg-slate-900 text-white ring-slate-900" : "",
                      active ? "bg-white ring-blue-200 shadow-sm text-slate-900" : "",
                      !done && !active ? "bg-slate-50 text-slate-700 ring-slate-200" : "",
                    ].join(" ")}
                    title={String(canAccess)}
                  >
                    {done ? (
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <StepIcon step={s} />
                    )}
                  </div>

                  <div
                    className={[
                      "text-[11px] sm:text-sm font-semibold transition text-center",
                      active ? "text-slate-900" : "text-slate-600",
                    ].join(" ")}
                  >
                    {s.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <form
          ref={formRef}
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && step !== "review" && e.target instanceof HTMLInputElement) {
              e.preventDefault();
            }
          }}
        >

          {/* Main card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {step === "basic" ? (
              <section>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-white text-sm font-bold shadow-md">
                    1
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Basic Info</h2>
                    <p className="text-xs text-slate-500">Edit the audit title, description, status and schedule</p>
                  </div>
                </div>

                <label className="mt-6 block">
                  <span className="text-sm font-semibold text-slate-700">Audit Title *</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="e.g., Q1 2026 Compliance Audit"
                    required
                  />
                </label>

                <label className="mt-4 block">
                  <span className="text-sm font-semibold text-slate-700">Description *</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="Describe the purpose and scope of this audit..."
                  />
                </label>

                <div className="mt-5">
                  <span className="text-sm font-semibold text-slate-700">Audit Status</span>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAuditStatus("DRAFT")}
                      className={[
                        "rounded-2xl border border-slate-200 p-4 text-left shadow-sm transition hover:bg-slate-50",
                        auditStatus === "DRAFT" ? "ring-2 ring-amber-200 bg-amber-50/40" : "bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="text-lg">📝</span> Draft
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Audit not yet active</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuditStatus("ACTIVE")}
                      className={[
                        "rounded-2xl border border-slate-200 p-4 text-left shadow-sm transition hover:bg-slate-50",
                        auditStatus === "ACTIVE" ? "ring-2 ring-green-200 bg-green-50/40" : "bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="text-lg">✅</span> Active
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Audit is live and running</div>
                    </button>
                  </div>
                </div>

                <div className="mt-5">
                  <CalendarDateRangePicker startDate={startDate} endDate={endDate} startTime={startTime} endTime={endTime} timezone={timezone} timezoneOptions={timezoneOptions} onStartChange={setStartDate} onEndChange={setEndDate} onStartTimeChange={setStartTime} onEndTimeChange={setEndTime} onTimezoneChange={setTimezone} />
                </div>

                {startDate && endDate && startAtIso && endAtIso && new Date(endAtIso) < new Date(startAtIso) ? (
                  <p className="mt-3 text-sm text-red-600">End date must be after start date.</p>
                ) : null}

                {!title.trim() && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    ⚠️ Audit title and description are required to proceed.
                  </div>
                )}

                {title.trim() && !description.trim() && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    ⚠️ Description is required to proceed.
                  </div>
                )}
              </section>
            ) : null}

            {step === "rooms" ? (
              <section>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-white text-sm font-bold shadow-md">
                    2
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Rooms Setup</h2>
                    <p className="text-xs text-slate-500">Set how many Front and Back Rooms this audit will have</p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Front Rooms stepper */}
                  <div className="overflow-hidden rounded-2xl border border-blue-200 shadow-sm">
                    <div className="bg-blue-100 px-5 py-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/40">
                        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-blue-700" stroke="currentColor">
                          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" strokeWidth="2" />
                          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-blue-700">Front Rooms</div>
                        <div className="text-sm font-medium text-blue-900">Auditor-facing rooms</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white px-6 py-5">
                      <button
                        type="button"
                        onClick={() => setFrontRoomsCount((n) => Math.max(1, n - 1))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-blue-200 bg-blue-50 text-2xl font-bold text-blue-600 transition hover:border-blue-400 hover:bg-blue-100 active:scale-95"
                      >−</button>
                      <div className="text-center">
                        <span className="text-6xl font-black text-slate-900 tabular-nums">{frontRoomsCount}</span>
                        <div className="mt-0.5 text-xs text-slate-400">room{frontRoomsCount !== 1 ? "s" : ""}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFrontRoomsCount((n) => Math.min(50, n + 1))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-blue-200 bg-blue-50 text-2xl font-bold text-blue-600 transition hover:border-blue-400 hover:bg-blue-100 active:scale-95"
                      >+</button>
                    </div>
                    <input type="hidden" name="frontRoomsCountVisible" value={frontRoomsCount} />
                  </div>

                  {/* Back Rooms stepper */}
                  <div className="overflow-hidden rounded-2xl border border-violet-200 shadow-sm">
                    <div className="bg-violet-100 px-5 py-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/40">
                        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-violet-700" stroke="currentColor">
                          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" strokeWidth="2" />
                          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-violet-700">Back Rooms</div>
                        <div className="text-sm font-medium text-violet-900">Internal team rooms</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white px-6 py-5">
                      <button
                        type="button"
                        onClick={() => setBackRoomsCount((n) => Math.max(1, n - 1))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-violet-200 bg-violet-50 text-2xl font-bold text-violet-600 transition hover:border-violet-400 hover:bg-violet-100 active:scale-95"
                      >−</button>
                      <div className="text-center">
                        <span className="text-6xl font-black text-slate-900 tabular-nums">{backRoomsCount}</span>
                        <div className="mt-0.5 text-xs text-slate-400">room{backRoomsCount !== 1 ? "s" : ""}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBackRoomsCount((n) => Math.min(50, n + 1))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-violet-200 bg-violet-50 text-2xl font-bold text-violet-600 transition hover:border-violet-400 hover:bg-violet-100 active:scale-95"
                      >+</button>
                    </div>
                    <input type="hidden" name="backRoomsCountVisible" value={backRoomsCount} />
                  </div>
                </div>

              </section>
            ) : null}

            {step === "connections" ? (
              <section>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-white text-sm font-bold shadow-md">
                    3
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Room Connections</h2>
                    <p className="text-xs text-slate-500">For each Back Room, select which Front Room(s) it connects to</p>
                  </div>
                </div>

                {backRoomsCount === 0 || frontRoomsCount === 0 ? (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    Define at least one Front Room and one Back Room in the previous step to set up connections.
                  </div>
                ) : (
                  <div className="mt-6 space-y-4">
                    {brRoles.map((br) => (
                      <div key={br.brIndex} className="overflow-hidden rounded-2xl border border-violet-200 shadow-sm">
                        <div className="bg-violet-100 px-5 py-3 flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/60 text-violet-700 text-sm font-bold">
                            {br.brIndex}
                          </div>
                          <div className="flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-violet-700">Back Room {br.brIndex}</div>
                          </div>
                          {br.connectedFrIndices.length > 0 ? (
                            <span className="text-xs font-semibold text-violet-700 bg-white/60 border border-violet-200 px-2 py-0.5 rounded-full">
                              {br.connectedFrIndices.length} connected
                            </span>
                          ) : (
                            <span className="text-xs text-violet-400">No connections</span>
                          )}
                        </div>
                        <div className="bg-white px-5 py-4 flex flex-wrap gap-2">
                          {frRoles.map((fr) => {
                            const isConnected = br.connectedFrIndices.includes(fr.frIndex);
                            return (
                              <button
                                key={fr.frIndex}
                                type="button"
                                onClick={() => {
                                  setBrRoles((prev) => prev.map((r) => {
                                    if (r.brIndex !== br.brIndex) return r;
                                    const newIndices = isConnected
                                      ? r.connectedFrIndices.filter((x) => x !== fr.frIndex)
                                      : [...r.connectedFrIndices, fr.frIndex];
                                    return { ...r, connectedFrIndices: newIndices };
                                  }));
                                }}
                                className={[
                                  "rounded-xl border-2 px-4 py-2 text-sm font-semibold transition active:scale-95",
                                  isConnected
                                    ? "border-blue-500 bg-blue-500 text-white shadow-sm"
                                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
                                ].join(" ")}
                              >
                                {isConnected ? "✓ " : ""}FR {fr.frIndex}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {step === "users" ? (
              <section>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-white text-sm font-bold shadow-md">
                      4
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Role Assignments</h2>
                      <p className="text-xs text-slate-500">Assign roles to each Front Room and Back Room</p>
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                    {frontRoomsCount} Front · {backRoomsCount} Back
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {frontRoomsCount > 0 && (
                    <>
                      <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Front Rooms</p>
                      {frRoles.map((fr) => (
                        <RoomAssigner
                          key={fr.frIndex}
                          title={`Front Room ${fr.frIndex}`}
                          accentBg="bg-blue-50"
                          accentText="text-blue-700"
                          accentBorder="border-blue-200"
                          roles={[
                                  { key: "lead", label: "FR Lead", color: "bg-blue-100 text-blue-800 border border-blue-200" },
                                  { key: "qm", label: "FR QM", color: "bg-indigo-100 text-indigo-800 border border-indigo-200" },
                                  { key: "sme", label: "SME", color: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
                                  { key: "transcription", label: "Transcriptionist", color: "bg-sky-100 text-sky-800 border border-sky-200" },
                          ]}
                          getUserIds={(roleKey) => {
                            if (roleKey === "lead") return fr.leadUserIds;
                            if (roleKey === "qm") return fr.qmUserIds;
                            if (roleKey === "sme") return fr.smeUserIds || [];
                            return fr.transcriptionUserIds;
                          }}
                          addUser={(roleKey, userId) => setFrRoles((prev) => prev.map((r) => {
                            if (r.frIndex !== fr.frIndex) return r;
                            if (roleKey === "lead") return { ...r, leadUserIds: r.leadUserIds.includes(userId) ? r.leadUserIds : [...r.leadUserIds, userId] };
                            if (roleKey === "qm") return { ...r, qmUserIds: r.qmUserIds.includes(userId) ? r.qmUserIds : [...r.qmUserIds, userId] };
                            if (roleKey === "sme") return { ...r, smeUserIds: (r.smeUserIds || []).includes(userId) ? r.smeUserIds : [...(r.smeUserIds || []), userId] };
                            return { ...r, transcriptionUserIds: r.transcriptionUserIds.includes(userId) ? r.transcriptionUserIds : [...r.transcriptionUserIds, userId] };
                          }))}
                          removeUser={(roleKey, userId) => setFrRoles((prev) => prev.map((r) => {
                            if (r.frIndex !== fr.frIndex) return r;
                            if (roleKey === "lead") return { ...r, leadUserIds: r.leadUserIds.filter((u) => u !== userId) };
                            if (roleKey === "qm") return { ...r, qmUserIds: r.qmUserIds.filter((u) => u !== userId) };
                            if (roleKey === "sme") return { ...r, smeUserIds: (r.smeUserIds || []).filter((u) => u !== userId) };
                            return { ...r, transcriptionUserIds: r.transcriptionUserIds.filter((u) => u !== userId) };
                          }))}
                          labelMap={userLabels}
                          onLabelAdd={(id, name, image, email) => setUserLabels((prev) => ({ ...prev, [id]: { name, image: image ?? undefined, email: email ?? undefined } }))}
                          customRoles={fr.customRoles || []}
                          onAddCustomRole={(roleName, userId) => setFrRoles((prev) => prev.map((r) => {
                            if (r.frIndex !== fr.frIndex) return r;
                            const existing = (r.customRoles || []).find((cr) => cr.name === roleName);
                            if (existing) {
                              return { ...r, customRoles: (r.customRoles || []).map((cr) => cr.name === roleName ? { ...cr, userIds: cr.userIds.includes(userId) ? cr.userIds : [...cr.userIds, userId] } : cr) };
                            }
                            return { ...r, customRoles: [...(r.customRoles || []), { name: roleName, userIds: [userId] }] };
                          }))}
                          onRemoveCustomRole={(roleName, userId) => setFrRoles((prev) => prev.map((r) => {
                            if (r.frIndex !== fr.frIndex) return r;
                            return { ...r, customRoles: (r.customRoles || []).map((cr) => cr.name === roleName ? { ...cr, userIds: cr.userIds.filter((u) => u !== userId) } : cr).filter((cr) => cr.userIds.length > 0) };
                          }))}
                        />
                      ))}
                    </>
                  )}

                  {backRoomsCount > 0 && (
                    <>
                      <p className="mt-2 text-xs font-bold uppercase tracking-widest text-violet-700">Back Rooms</p>
                      {brRoles.map((br) => (
                        <RoomAssigner
                          key={br.brIndex}
                          title={`Back Room ${br.brIndex}`}
                          accentBg="bg-violet-50"
                          accentText="text-violet-700"
                          accentBorder="border-violet-200"
                          roles={[
                            { key: "lead", label: "BR Lead", color: "bg-indigo-100 text-indigo-800 border border-indigo-200" },
                            { key: "qm", label: "BR QM", color: "bg-violet-100 text-violet-800 border border-violet-200" },
                            { key: "qualityReviewer", label: "Quality Reviewer", color: "bg-purple-100 text-purple-800 border border-purple-200" },
                            { key: "smePrep", label: "SME Prep", color: "bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200" },
                            { key: "caller", label: "Caller", color: "bg-pink-100 text-pink-800 border border-pink-200" },
                            { key: "outgoing", label: "Outgoing", color: "bg-rose-100 text-rose-800 border border-rose-200" },
                            { key: "incoming", label: "Incoming", color: "bg-orange-100 text-orange-800 border border-orange-200" },
                            { key: "recordsPrep", label: "Records Prep", color: "bg-amber-100 text-amber-800 border border-amber-200" },
                          ]}
                          getUserIds={(roleKey) => {
                            if (roleKey === "lead") return br.leadUserIds;
                            if (roleKey === "caller") return br.callerUserIds;
                            if (roleKey === "qm") return br.qmUserIds || [];
                            if (roleKey === "qualityReviewer") return br.qualityReviewerUserIds || [];
                            if (roleKey === "smePrep") return br.smePrepUserIds || [];
                            if (roleKey === "outgoing") return br.outgoingUserIds;
                            if (roleKey === "incoming") return br.incomingUserIds;
                            return br.recordsPrepUserIds;
                          }}
                          addUser={(roleKey, userId) => setBrRoles((prev) => prev.map((r) => {
                            if (r.brIndex !== br.brIndex) return r;
                            if (roleKey === "lead") return { ...r, leadUserIds: r.leadUserIds.includes(userId) ? r.leadUserIds : [...r.leadUserIds, userId] };
                            if (roleKey === "caller") return { ...r, callerUserIds: r.callerUserIds.includes(userId) ? r.callerUserIds : [...r.callerUserIds, userId] };
                            if (roleKey === "qm") return { ...r, qmUserIds: (r.qmUserIds || []).includes(userId) ? r.qmUserIds : [...(r.qmUserIds || []), userId] };
                            if (roleKey === "qualityReviewer") return { ...r, qualityReviewerUserIds: (r.qualityReviewerUserIds || []).includes(userId) ? r.qualityReviewerUserIds : [...(r.qualityReviewerUserIds || []), userId] };
                            if (roleKey === "smePrep") return { ...r, smePrepUserIds: (r.smePrepUserIds || []).includes(userId) ? r.smePrepUserIds : [...(r.smePrepUserIds || []), userId] };
                            if (roleKey === "outgoing") return { ...r, outgoingUserIds: r.outgoingUserIds.includes(userId) ? r.outgoingUserIds : [...r.outgoingUserIds, userId] };
                            if (roleKey === "incoming") return { ...r, incomingUserIds: r.incomingUserIds.includes(userId) ? r.incomingUserIds : [...r.incomingUserIds, userId] };
                            return { ...r, recordsPrepUserIds: r.recordsPrepUserIds.includes(userId) ? r.recordsPrepUserIds : [...r.recordsPrepUserIds, userId] };
                          }))}
                          removeUser={(roleKey, userId) => setBrRoles((prev) => prev.map((r) => {
                            if (r.brIndex !== br.brIndex) return r;
                            if (roleKey === "lead") return { ...r, leadUserIds: r.leadUserIds.filter((u) => u !== userId) };
                            if (roleKey === "caller") return { ...r, callerUserIds: r.callerUserIds.filter((u) => u !== userId) };
                            if (roleKey === "qm") return { ...r, qmUserIds: (r.qmUserIds || []).filter((u) => u !== userId) };
                            if (roleKey === "qualityReviewer") return { ...r, qualityReviewerUserIds: (r.qualityReviewerUserIds || []).filter((u) => u !== userId) };
                            if (roleKey === "smePrep") return { ...r, smePrepUserIds: (r.smePrepUserIds || []).filter((u) => u !== userId) };
                            if (roleKey === "outgoing") return { ...r, outgoingUserIds: r.outgoingUserIds.filter((u) => u !== userId) };
                            if (roleKey === "incoming") return { ...r, incomingUserIds: r.incomingUserIds.filter((u) => u !== userId) };
                            return { ...r, recordsPrepUserIds: r.recordsPrepUserIds.filter((u) => u !== userId) };
                          }))}
                          labelMap={userLabels}
                          onLabelAdd={(id, name, image, email) => setUserLabels((prev) => ({ ...prev, [id]: { name, image: image ?? undefined, email: email ?? undefined } }))}
                          customRoles={br.customRoles || []}
                          onAddCustomRole={(roleName, userId) => setBrRoles((prev) => prev.map((r) => {
                            if (r.brIndex !== br.brIndex) return r;
                            const existing = (r.customRoles || []).find((cr) => cr.name === roleName);
                            if (existing) {
                              return { ...r, customRoles: (r.customRoles || []).map((cr) => cr.name === roleName ? { ...cr, userIds: cr.userIds.includes(userId) ? cr.userIds : [...cr.userIds, userId] } : cr) };
                            }
                            return { ...r, customRoles: [...(r.customRoles || []), { name: roleName, userIds: [userId] }] };
                          }))}
                          onRemoveCustomRole={(roleName, userId) => setBrRoles((prev) => prev.map((r) => {
                            if (r.brIndex !== br.brIndex) return r;
                            return { ...r, customRoles: (r.customRoles || []).map((cr) => cr.name === roleName ? { ...cr, userIds: cr.userIds.filter((u) => u !== userId) } : cr).filter((cr) => cr.userIds.length > 0) };
                          }))}
                        />
                      ))}
                    </>
                  )}
                </div>
              </section>
            ) : null}

            {step === "status" ? (
              <section>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-white text-sm font-bold shadow-md">
                    5
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Request Statuses</h2>
                    <p className="text-xs text-slate-500">Define the kanban columns requests will move through</p>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-600">
                  Define the columns for your kanban board. Requests will move through these stages. Drag to reorder.
                </p>

                {statusColumns.length === 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    ⚠️ Please add at least one status column to proceed.
                  </div>
                )}

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3 px-0 sm:px-2">
                  {statusColumns.map((c, idx) => {
                    const colorInfo = statusColors.find((sc) => sc.value === c.color) || statusColors[0]!;
                    return (
                      <div
                        key={`${c.order}-${idx}`}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={[
                          "flex items-center gap-3 rounded-2xl border px-4 py-3 transition w-full shadow-sm select-none",
                          draggedIndex === idx ? "opacity-60 ring-2 ring-slate-200" : "hover:shadow-md",
                          colorInfo.bg,
                        ].join(" ")}
                        style={{ borderColor: c.color + "35" }}
                      >
                        <svg className="h-5 w-5 shrink-0 text-slate-400 cursor-move" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>

                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-slate-900 border border-slate-200 shadow-sm">
                          {idx + 1}
                        </div>

                        {editingStatusIdx === idx ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingStatusName}
                            onChange={(e) => setEditingStatusName(e.target.value)}
                            onBlur={commitEditStatus}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEditStatus();
                              if (e.key === "Escape") setEditingStatusIdx(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
                          />
                        ) : (
                          <span
                            onClick={(e) => { e.stopPropagation(); startEditStatus(idx); }}
                            title="Click to rename"
                            className="flex-1 min-w-0 cursor-pointer truncate rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-white/60 transition"
                          >
                            {c.name}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeStatus(idx); }}
                          className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-100"
                          title="Remove"
                        >
                          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex justify-center">
                  <div className="flex gap-2 w-full max-w-md">
                    <input
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      placeholder="New column name..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addStatus(newColumnName);
                        setNewColumnName("");
                      }}
                      className="shrink-0 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
                    >
                      <span className="hidden sm:inline">+ Add</span>
                      <span className="sm:hidden">+</span>
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {step === "review" ? (
              <section>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-white text-sm font-bold shadow-md">
                    6
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Review & Save</h2>
                    <p className="text-xs text-slate-500">Verify your changes before saving the audit</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm font-bold text-slate-900">Ready to Save!</div>
                  <p className="mt-1 text-sm text-slate-700">
                    Review your audit configuration below. You can always modify these settings after saving.
                  </p>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-slate-600">Audit Title</div>
                  <div className="mt-1 text-lg font-bold text-slate-900 break-words">{title || "—"}</div>

                  {description ? (
                    <div className="mt-3">
                      <div className="text-sm font-semibold text-slate-600">Description</div>
                      <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{description}</div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold text-slate-600">Start Date</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{startDate || "—"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold text-slate-600">End Date</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{endDate || "—"}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                    <div className="text-3xl font-bold text-slate-900">{frontRoomsCount}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">Front Rooms</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                    <div className="text-3xl font-bold text-slate-900">{backRoomsCount}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">Back Rooms</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                    <div className="text-3xl font-bold text-slate-900">{usersAssignedCount}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">Users Assigned</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                    <div className="text-3xl font-bold text-slate-900">{statusColumns.length}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">Request Statuses</div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-slate-700">Status Workflow</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {statusColumns.map((c, idx) => (
                      <span
                        key={`${c.name}-${idx}`}
                        className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-xs font-semibold text-slate-900"
                        style={{
                          backgroundColor: c.color + "12",
                          borderColor: c.color + "35",
                        }}
                      >
                        {idx + 1}. {c.name}
                      </span>
                    ))}
                  </div>
                </div>

                {!state.ok && state.error ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {state.error}
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Saved toast */}
            {savedAt ? (
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Changes saved successfully!
              </div>
            ) : null}

            {/* Footer buttons */}
            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={stepIndex === 0 || pending}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                ← Previous
              </button>

              <div className="flex items-center gap-2">
                {/* Save without redirect — available on all steps except the review step */}
                {step !== "review" && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={pending}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {pending && saveMode === "save" ? "Saving…" : "💾 Save"}
                  </button>
                )}

                {step === "review" ? (
                  /* Final save + redirect */
                  <button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={pending}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {pending && saveMode === "final" ? "Saving…" : "✓ Save & Finish"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canGoNext || pending}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>

            {/* Keep server action error visible for non-review too */}
            {!state.ok && state.error && step !== "review" ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {state.error}
              </div>
            ) : null}
          </div>
        </form>
      </div>
    </main>
  );
}