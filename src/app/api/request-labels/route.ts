import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { parseDefaultRequestLabels } from "@/components/request-labels-shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await db.appConfig.findUnique({ where: { key: "defaultRequestLabels" } });
  const labels = parseDefaultRequestLabels(config?.value);
  return NextResponse.json({ labels });
}
