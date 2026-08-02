"use client";

/**
 * RequestPrintView — print-only rendering of a request.
 * Rendered via `hidden print:block` so it only appears when printing.
 * Import and place this above the interactive form in the request page.
 */

export interface RequestPrintData {
  trackNumber: string | null;
  title: string;
  isFormal: boolean;
  status: string;
  estimatedDeliveryDate: string | null;
  fr: string;
  labels: string[];
  assignees: string[];
  noteText: string;
  comments: {
    authorName: string;
    text: string;
    createdAt: string;
  }[];
  documents: {
    filename: string;
  }[];
  auditTitle: string;
  auditTrackId: string | null;
}

function PrintField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mr-2">
        {label}:
      </span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  );
}

function CoverField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 pb-2" style={{ borderBottom: "1px solid #cbd5e1" }}>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.2em] w-28 shrink-0"
        style={{ color: "#0B5FAA" }}
      >
        {label}
      </span>
      <span className="text-base font-medium" style={{ color: "#1e293b" }}>
        {value}
      </span>
    </div>
  );
}

function PrintSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-300 pb-1 mb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function RequestPrintView({ data }: { data: RequestPrintData }) {
  const printDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // trackNumber may look like "0005–FR1–hi test question".
  // Strip the trailing "–{title}" so the hero shows only "0005–FR1".
  const rawTrack = data.trackNumber ?? "";
  const trimmedTitleSuffix = data.title.trim();
  let heroTrack = rawTrack;
  if (trimmedTitleSuffix && rawTrack.endsWith(trimmedTitleSuffix)) {
    heroTrack = rawTrack.slice(0, -trimmedTitleSuffix.length).replace(/[–—-]\s*$/, "");
  } else {
    // Fallback: keep only the first two "–"-separated segments (e.g. "0005–FR1")
    const parts = rawTrack.split(/[–—]/);
    if (parts.length >= 2) heroTrack = `${parts[0]}–${parts[1]}`;
  }
  if (!heroTrack) heroTrack = "—";

  return (
    <div className="hidden print:block font-sans text-slate-900">
      {/* ── Cover Page ── */}
      <div
        className="flex flex-col"
        style={{ minHeight: "calc(100vh - 5cm)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between pb-4"
          style={{ borderBottom: "0.5pt solid #cbd5e1" }}
        >
          <div className="flex items-center gap-3">
            <img src="/Philips_logo.png" alt="Philips" className="h-10 w-auto object-contain" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Audit Management Tool
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>
              <span className="font-semibold uppercase tracking-widest text-[10px] text-slate-400 mr-1">
                Printed on:
              </span>
              {printDate}
            </p>
          </div>
        </div>

        {/* Divider after header */}
        <div style={{ height: "2pt", backgroundColor: "#0B5FAA", marginTop: "4pt" }} />

        {/* Track number — hero */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-10">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.3em] mb-3"
            style={{ color: "#0B5FAA" }}
          >
            Request
          </p>
          <h1
            className="font-extrabold tracking-tight max-w-3xl"
            style={{
              fontSize: "40pt",
              lineHeight: 1.1,
              color: "#0f172a",
              wordBreak: "break-word",
            }}
          >
            {data.title}
          </h1>

          {/* Track number under hero */}
          <p
            className="mt-4 text-xl font-semibold max-w-2xl"
            style={{ color: "#475569" }}
          >
            {heroTrack}
          </p>

          {/* Key details */}
          <div className="mt-10 w-full max-w-xl text-left space-y-3">
            <CoverField
              label="Audit"
              value={
                data.auditTrackId
                  ? `${data.auditTrackId} · ${data.auditTitle}`
                  : data.auditTitle
              }
            />
            <CoverField
              label="Labels"
              value={data.labels.length > 0 ? data.labels.join(" · ") : "—"}
            />
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        className="fixed bottom-0 left-0 right-0 pt-2 pb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-8 bg-white"
        style={{ borderTop: "0.5pt solid #cbd5e1" }}
      >
        <div className="flex items-center gap-2 justify-self-start">
          <img src="/Philips_logo.png" alt="Philips" className="h-8 w-auto object-contain opacity-70" />
        </div>
        <div className="flex flex-col leading-tight text-center justify-self-center">
          <span className="text-[9px] text-slate-500 whitespace-nowrap">
            © {new Date().getFullYear()} Philips Medical Systems Technologies Ltd (Israel)
          </span>
          <span className="text-[9px] text-slate-500 whitespace-nowrap">
            For internal use only
          </span>
          <span className="text-[9px] text-slate-500 whitespace-nowrap">
            CT/AMI Business - QMS-0014 Philips
          </span>
          <span className="text-[9px] text-slate-500 whitespace-nowrap">
            Information Classification: Confidential
          </span>
          <span className="text-[9px] text-slate-500 whitespace-nowrap">
            Printed copies are uncontrolled unless authenticated
          </span>
        </div>
        <div className="justify-self-end" />
      </div>
    </div>
  );
}
