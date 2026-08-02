import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const frIndex = req.nextUrl.searchParams.get("frIndex");

  if (!frIndex) {
    return NextResponse.json({ error: "frIndex required" }, { status: 400 });
  }

  const label = `FR${frIndex}`;

  const requests = await db.request.findMany({
    where: {
      auditId,
      labels: { contains: label },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      trackNumber: true,
      title: true,
      statusName: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ requests });
}
