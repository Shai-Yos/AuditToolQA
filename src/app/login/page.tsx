import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/server/db";
import { SignInButton } from "./ui";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    // Check if user exists in DB
    const user = await db.user.findUnique({
      where: { email: session.user.email! },
      select: { isActive: true, role: true },
    });

    if (user) {
      // Check if user is active
      if (!user.isActive) {
        redirect("/request-access");
      }
      // User exists, redirect based on role
      if (session.user.role === "ADMIN") {
        redirect("/adminDashboard");
      } else if (session.user.role === "AUDIT_OWNER") {
        redirect("/auditOwnerDashboard");
      } else {
        redirect("/userDashboard");
      }
    }
    // If user not in DB, fall through to show login page
  }

  return (
    <div className="relative flex min-h-screen items-center justify-start bg-slate-50 px-4 overflow-hidden" style={{ backgroundImage: "url('/background.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}>
      <div className="relative w-full max-w-3xl space-y-6 mx-4 sm:ml-12 md:ml-24 lg:ml-48">
        {/* Disclaimer Card */}
        <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
          <div className="text-center mb-6">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
              QA Environment
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              Audit / Inspection Management Tool
            </h1>
            <p className="mt-2 text-lg text-slate-500">
              Internal / External Quality Audit / Inspection Platform
            </p>
          </div>

          <h2 className="text-base font-semibold text-slate-900">
            About this tool
          </h2>
          <p className="mt-2 text-base leading-relaxed text-slate-600">
            This application is used to manage and track Internal / External Audits / Inspections, requests, and documentation. 
            Access is restricted to authorized Philips personnel only.
          </p>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-slate-600">
                You will be redirected to <span className="font-semibold text-slate-900">Microsoft Azure AD</span> to 
                authenticate with your Philips corporate account.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <SignInButton />
          </div>
        </div>

        <div className="text-center text-sm text-slate-400 mx-auto max-w-xl space-y-1">
          <p>&copy; {new Date().getFullYear()} Philips Medical Systems Technologies Ltd (Israel).</p>
          <p>For internal use only.</p>
          <p>Developed by CT/AMI Business - QMS-0014.</p>
        </div>
      </div>
    </div>
  );
}