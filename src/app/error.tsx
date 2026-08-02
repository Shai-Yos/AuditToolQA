"use client";

import { useRouter } from "next/navigation";

/**
 * Route-level error boundary — catches errors in any page/layout below root.
 * Unlike global-error.tsx, this renders inside the root layout (has styles/fonts).
 */

function getErrorInfo(error: Error) {
  const msg = error.message ?? "";
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) {
    return {
      title: "Server Unreachable",
      description: "The server is not responding. This is likely a temporary network or infrastructure issue. Please check your connection and try again.",
      icon: "🔌",
    };
  }
  if (/ECONNRESET|socket hang up/i.test(msg)) {
    return {
      title: "Connection Lost",
      description: "The connection to the server was interrupted. This usually resolves on its own — please retry in a moment.",
      icon: "📡",
    };
  }
  if (/database|prisma|SQL|timeout.*query/i.test(msg)) {
    return {
      title: "Database Error",
      description: "The system could not reach the database. This may be a temporary issue with the database server. Please try again shortly.",
      icon: "🗄️",
    };
  }
  if (/unauthorized|401|403|forbidden/i.test(msg)) {
    return {
      title: "Access Denied",
      description: "You don't have permission to access this page, or your session has expired. Please sign in again.",
      icon: "🔒",
    };
  }
  if (/not found|404/i.test(msg)) {
    return {
      title: "Not Found",
      description: "The page or resource you're looking for doesn't exist or has been removed.",
      icon: "🔍",
    };
  }
  return {
    title: "Something went wrong",
    description: "An unexpected error occurred while loading this page. Please try again — if the issue persists, contact your administrator.",
    icon: "⚠️",
  };
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const info = getErrorInfo(error);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
          {info.icon}
        </div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          {info.title}
        </h1>
        <p className="mb-4 text-sm text-gray-500">
          {info.description}
        </p>
        {error.message && (
          <details className="mb-4 text-left">
            <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600">
              Technical details
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-600 whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </details>
        )}
        {error.digest && (
          <p className="mb-4 font-mono text-xs text-gray-400">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { router.refresh(); reset(); }}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
