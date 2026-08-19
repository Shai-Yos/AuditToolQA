import { NextResponse } from "next/server";
import { env } from "@/env";
import { exportChangedTranscriptions } from "@/server/helpers/transcriptionExport";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const maxParam = Number(url.searchParams.get("max") ?? "200");
  const maxChannelsPerRun = Number.isFinite(maxParam)
    ? Math.min(Math.max(Math.floor(maxParam), 1), 1000)
    : 200;

  const summary = await exportChangedTranscriptions({ maxChannelsPerRun });
  return NextResponse.json({ ok: true, ...summary });
}
