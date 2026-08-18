import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/helpers/currentUser";
import { getAuditTabCounts } from "@/server/lib/audit-tab-counts";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // Exclude items created by the current user so they don't see their own dots
  const counts = await getAuditTabCounts(auditId, userId);

  return NextResponse.json(counts);
}
