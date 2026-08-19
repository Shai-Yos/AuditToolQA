import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/server/db";

type OpenRequestSearchParams = {
  auditId?: string;
  requestId?: string;
};

function buildSelfUrl(auditId: string, requestId: string): string {
  return `/open-request?auditId=${encodeURIComponent(auditId)}&requestId=${encodeURIComponent(requestId)}`;
}

export default async function OpenRequestPage({
  searchParams,
}: {
  searchParams: Promise<OpenRequestSearchParams>;
}) {
  const params = await searchParams;
  const auditId = params.auditId?.trim() ?? "";
  const requestId = params.requestId?.trim() ?? "";

  if (!auditId || !requestId) {
    redirect("/login");
  }

  const session = await auth();
  if (!session?.user?.id) {
    const next = buildSelfUrl(auditId, requestId);
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isActive: true },
  });

  if (!user?.isActive) {
    redirect("/request-access");
  }

  const request = await db.request.findFirst({
    where: { id: requestId, auditId },
    select: { id: true },
  });

  if (!request) {
    if (user.role === "ADMIN") redirect("/adminDashboard");
    if (user.role === "AUDIT_OWNER") redirect("/auditOwnerDashboard");
    redirect("/userDashboard");
  }

  redirect(`/api/requests/${requestId}/view`);
}
