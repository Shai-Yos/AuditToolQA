import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: {
      title: true,
      frontRoomsCount: true,
      requestStatuses: { select: { id: true, name: true, color: true, order: true } },
      requests: { select: { requestStatusId: true } },
    },
  });

  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const statusBanner = audit.requestStatuses
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((col) => ({
      id: col.id,
      name: col.name,
      color: col.color,
      count: audit.requests.filter((r) => r.requestStatusId === col.id).length,
    }));

  return NextResponse.json({
    title: audit.title,
    frontRoomsCount: audit.frontRoomsCount,
    statusBanner,
    totalRequests: audit.requests.length,
  });
}
