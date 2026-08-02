import { Suspense } from "react";

function RequestLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-64 rounded-xl bg-slate-200 animate-pulse" />
          <div className="h-10 w-24 rounded-xl bg-slate-200 animate-pulse" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-slate-200 animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 rounded-xl bg-slate-200 animate-pulse" />
            <div className="h-10 rounded-xl bg-slate-200 animate-pulse" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="h-4 w-20 rounded bg-slate-200 animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-slate-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function RequestDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={<RequestLoadingFallback />}>{children}</Suspense>;
}
