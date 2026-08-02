"use client";

import { useState, useTransition } from "react";
import { submitAccessRequest } from "@/app/request-access/actions";

type ExistingRequest = {
  status: string;
  requestedRole: string;
  createdAt: string;
  reviewNote?: string | null;
} | null;

const ROLE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "AUDIT_OWNER", label: "Audit Owner", description: "Can create and manage their own audits" },
  { value: "ADMIN", label: "Admin", description: "Full access to all features and management" },
];

function roleLabel(role: string) {
  return role === "ADMIN" ? "Admin" : role === "AUDIT_OWNER" ? "Audit Owner" : "User";
}

export default function RoleUpgradeRequestUI({
  currentRole,
  userEmail,
  userName,
  existingRequest,
}: {
  currentRole: string;
  userEmail: string;
  userName: string;
  existingRequest: ExistingRequest;
}) {
  const availableOptions = ROLE_OPTIONS.filter((o) => {
    if (currentRole === "USER") return true;
    if (currentRole === "AUDIT_OWNER") return o.value === "ADMIN";
    return false;
  });

  const [requestedRole, setRequestedRole] = useState(availableOptions[0]?.value ?? "ADMIN");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isPending_ = existingRequest?.status === "PENDING" && !submitted;
  const isRejected = existingRequest?.status === "REJECTED";

  if (isPending_) {
    return (
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Request Pending</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Your upgrade request to{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {roleLabel(existingRequest!.requestedRole)}
          </span>{" "}
          is under review.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Submitted {new Date(existingRequest!.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </p>
        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800/30 p-4 text-sm text-blue-700 dark:text-blue-300">
          An admin will review your request and update your role.
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Request Submitted</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          An administrator will review your request shortly.
        </p>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }
    startTransition(async () => {
      const result = await submitAccessRequest({
        email: userEmail,
        name: userName,
        requestedRole,
        reason,
      });
      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error ?? "Failed to submit request");
      }
    });
  }

  return (
    <div>
      {isRejected && existingRequest && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800/30 p-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Your previous request was rejected</p>
          </div>
          {existingRequest.reviewNote && (
            <blockquote className="mt-2 border-l-4 border-slate-300 dark:border-slate-600 pl-3 py-1 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap italic">
              <span className="font-semibold not-italic text-slate-700 dark:text-slate-200">Reason: </span>
              “{existingRequest.reviewNote}”
            </blockquote>
          )}
          <p className="mt-3 text-xs text-red-500 dark:text-red-400">Please review the reason above and submit a new request below.</p>
        </div>
      )}

      <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50 dark:bg-slate-700/30 dark:border-slate-600/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Current Role</p>
        <span
          className={[
            "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1",
            currentRole === "ADMIN"
              ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800"
              : currentRole === "AUDIT_OWNER"
                ? "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-800"
                : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800",
          ].join(" ")}
        >
          {roleLabel(currentRole)}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Requested Role <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-col gap-2">
            {availableOptions.map((opt) => {
              const isSelected = requestedRole === opt.value;
              const selectedClasses =
                opt.value === "ADMIN"
                  ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200 dark:bg-amber-900/20 dark:border-amber-500 dark:ring-amber-800"
                  : opt.value === "AUDIT_OWNER"
                    ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-500 dark:ring-indigo-800"
                    : "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500 dark:ring-emerald-800";
              const accent =
                opt.value === "ADMIN"
                  ? "accent-amber-600"
                  : opt.value === "AUDIT_OWNER"
                    ? "accent-indigo-600"
                    : "accent-emerald-600";
              return (
                <label
                  key={opt.value}
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
                    isSelected
                      ? selectedClasses
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700/30 dark:hover:border-slate-500",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={isSelected}
                    onChange={() => setRequestedRole(opt.value)}
                    className={`mt-0.5 shrink-0 ${accent}`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{opt.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why do you need this role? What will you use it for?"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:bg-slate-700"
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
        >
          {isPending ? "Submitting…" : "Submit Request"}
        </button>
      </form>
    </div>
  );
}
