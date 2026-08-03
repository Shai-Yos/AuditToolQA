"use client";

import { signIn } from "next-auth/react";

export function SignInButton() {
  return (
    <button
      // Starts the Azure AD authentication flow.
      onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
      className="group relative flex w-full max-w-xs mx-auto items-center justify-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-100"
    >
      {/* Microsoft-style icon for Azure AD sign-in. */}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 21 21" fill="currentColor">
        <rect x="1" y="1" width="9" height="9" />
        <rect x="11" y="1" width="9" height="9" />
        <rect x="1" y="11" width="9" height="9" />
        <rect x="11" y="11" width="9" height="9" />
      </svg>
      Sign in with Azure AD
    </button>
  );
}