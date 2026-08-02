"use client";

import { useState, useTransition } from "react";
import { submitAccessRequest } from "./actions";

type Props = {
  prefillEmail?: string;
  prefillName?: string;
  existingRequest?: {
    status: string;
    requestedRole: string;
    createdAt: string;
    reviewNote?: string | null;
  } | null;
};

const ROLE_OPTIONS = [
  {
    value: "USER",
    label: "User",
    description: "View and participate in assigned audits",
    tint: {
      icon: "bg-emerald-100 text-emerald-600",
      selected:
        "border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-200 dark:border-emerald-400 dark:bg-emerald-500/15 dark:ring-emerald-500/40",
      check: "bg-emerald-500",
    },
    // user icon
    iconPath:
      "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  },
  {
    value: "AUDIT_OWNER",
    label: "Audit Owner",
    description: "Create and manage audits you own",
    tint: {
      icon: "bg-indigo-100 text-indigo-600",
      selected:
        "border-indigo-400 bg-indigo-50/70 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-500/15 dark:ring-indigo-500/40",
      check: "bg-indigo-500",
    },
    // clipboard-check icon
    iconPath:
      "M9 12h6m-6 4h4m1.5-12H8.25A2.25 2.25 0 006 6.25v13.5A2.25 2.25 0 008.25 22h7.5A2.25 2.25 0 0018 19.75V6.25A2.25 2.25 0 0015.75 4zM9 4V2.75A.75.75 0 019.75 2h4.5a.75.75 0 01.75.75V4",
  },
  {
    value: "ADMIN",
    label: "Admin",
    description: "Full access to all features and users",
    tint: {
      icon: "bg-amber-100 text-amber-600",
      selected:
        "border-amber-400 bg-amber-50/70 ring-2 ring-amber-200 dark:border-amber-400 dark:bg-amber-500/15 dark:ring-amber-500/40",
      check: "bg-amber-500",
    },
    // shield-check icon
    iconPath:
      "M9 12.75L11.25 15 15 9.75M12 3l8.485 3.03a.75.75 0 01.515.71v5.51c0 4.72-3.29 8.94-9 10.5-5.71-1.56-9-5.78-9-10.5V6.74a.75.75 0 01.515-.71L12 3z",
  },
];

export default function RequestAccessUI({ prefillEmail, prefillName, existingRequest }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [name, setName] = useState(prefillName ?? "");
  const [requestedRole, setRequestedRole] = useState("USER");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Already has a PENDING request (not just submitted now)
  if (existingRequest?.status === "PENDING" && !submitted) {
    return (
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-blue-100 p-5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Request Pending</h1>
        <p className="mt-3 text-base text-slate-500 leading-relaxed">
          Your access request for{" "}
          <span className="font-semibold text-slate-700">{existingRequest.requestedRole.replace("_", " ")}</span>{" "}
          role is pending review by an administrator.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Submitted on {new Date(existingRequest.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </p>
        <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          You will be able to log in once an admin approves your request.
        </div>
        <a href="/login" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
          Back to Login
        </a>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-emerald-100 p-5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Request Submitted</h1>
        <p className="mt-3 text-base text-slate-500 leading-relaxed">
          Your access request has been submitted. An administrator will review it shortly.
        </p>
        <div className="mt-8 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
          You will be able to log in once your request is approved.
        </div>
        <a href="/login" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
          Back to Login
        </a>
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
      const result = await submitAccessRequest({ email, name, requestedRole, reason });
      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error ?? "Failed to submit request");
      }
    });
  }

  const isRejected = existingRequest?.status === "REJECTED";

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex justify-center">
        <div className="rounded-full bg-blue-100 p-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
      </div>

      <h1 className="text-center text-2xl font-bold text-slate-900">Request Access</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Fill in the form below and an administrator will review your request.
      </p>

      {isRejected && existingRequest && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-semibold text-red-700">Your previous request was rejected</p>
          </div>
          {existingRequest.reviewNote && (
            <blockquote className="mt-2 border-l-4 border-slate-300 pl-3 py-1 text-sm text-slate-700 whitespace-pre-wrap italic">
              <span className="font-semibold not-italic text-slate-700">Reason: </span>
              “{existingRequest.reviewNote}”
            </blockquote>
          )}
          <p className="mt-3 text-xs text-red-500">Please review the reason above and submit a new request below.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
        {/* Name + Email row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              readOnly={!!prefillName}
              className={[
                "w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100",
                prefillName ? "bg-slate-100 cursor-not-allowed" : "bg-slate-50",
              ].join(" ")}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Work Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.name@philips.com"
              readOnly={!!prefillEmail}
              className={[
                "w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100",
                prefillEmail ? "bg-slate-100 cursor-not-allowed" : "bg-slate-50",
              ].join(" ")}
            />
          </div>
        </div>

        {/* Role */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Requested Role <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ROLE_OPTIONS.map((opt) => {
              const selected = requestedRole === opt.value;
              return (
                <label
                  key={opt.value}
                  className={[
                    "group relative flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-xl border p-3 text-center transition",
                    selected
                      ? opt.tint.selected
                      : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={selected}
                    onChange={() => setRequestedRole(opt.value)}
                    className="sr-only"
                  />

                  {/* Checkmark badge */}
                  <span
                    className={[
                      "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white shadow transition",
                      selected ? `${opt.tint.check} scale-100 opacity-100` : "scale-75 opacity-0",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                    </svg>
                  </span>

                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{opt.label}</p>
                  <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">{opt.description}</p>
                </label>
              );
            })}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why do you need access? Please provide a brief explanation."
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

        <div className="mt-1 flex items-center justify-between gap-3">
          <a href="/login" className="text-sm text-slate-400 transition hover:text-slate-600">
            Back to Login
          </a>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isPending ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
