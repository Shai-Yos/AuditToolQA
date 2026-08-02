import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/server/db";
import RequestAccessUI from "./ui";

type SearchParams = Promise<{ email?: string; name?: string }>;

export default async function RequestAccessPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();
  const params = (await searchParams) ?? {};

  // If user is logged in and active, redirect to their dashboard
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isActive: true, role: true, email: true, name: true },
    });

    if (user?.isActive) {
      if (user.role === "ADMIN") redirect("/adminDashboard");
      else if (user.role === "AUDIT_OWNER") redirect("/auditOwnerDashboard");
      else redirect("/userDashboard");
    }
  }

  // Prefill order: active session > query params (forwarded from blocked sign-in)
  const email = session?.user?.email ?? params.email ?? undefined;
  const name = session?.user?.name ?? params.name ?? undefined;

  const latest = email
    ? await db.accessRequest.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
        select: { status: true, requestedRole: true, createdAt: true, reviewNote: true },
      })
    : null;

  const existingRequest =
    latest && (latest.status === "PENDING" || latest.status === "REJECTED")
      ? latest
      : null;

  const serialized = existingRequest
    ? {
        ...existingRequest,
        createdAt: existingRequest.createdAt.toISOString(),
      }
    : null;

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 overflow-hidden"
      style={{
        backgroundImage: "url('/background.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="w-full max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <RequestAccessUI
            prefillEmail={email}
            prefillName={name}
            existingRequest={serialized}
          />
        </div>
      </div>
    </div>
  );
}
