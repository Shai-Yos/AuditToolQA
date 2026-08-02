import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/helpers/currentUser";

/**
 * In-memory typing status store.
 * Key: `${auditId}::${channel}::${userId}`
 * Value: { name, timestamp }
 *
 * Entries expire after TYPING_TTL_MS.
 */
const TYPING_TTL_MS = 5_000;

const typingMap = new Map<
  string,
  { name: string; timestamp: number }
>();

// Periodically purge stale entries (every 30 s)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of typingMap) {
    if (now - entry.timestamp > TYPING_TTL_MS) typingMap.delete(key);
  }
}, 30_000);

function channelKey(auditId: string, channel: string, userId: string) {
  return `${auditId}::${channel}::${userId}`;
}

/** POST — report that the current user is typing */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { channel } = (await req.json()) as { channel?: string };
  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const key = channelKey(auditId, channel, user.id);
  typingMap.set(key, {
    name: user.name ?? user.email ?? "Someone",
    timestamp: Date.now(),
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — clear typing status (call when message is sent) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { channel } = (await req.json()) as { channel?: string };
  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const key = channelKey(auditId, channel, user.id);
  typingMap.delete(key);

  return NextResponse.json({ ok: true });
}

/** GET — list users currently typing on a channel */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channel = req.nextUrl.searchParams.get("channel") ?? "";
  if (!channel) {
    return NextResponse.json([]);
  }

  const now = Date.now();
  const prefix = `${auditId}::${channel}::`;
  const typing: string[] = [];

  for (const [key, entry] of typingMap) {
    if (!key.startsWith(prefix)) continue;
    if (now - entry.timestamp > TYPING_TTL_MS) {
      typingMap.delete(key);
      continue;
    }
    // Don't show the current user as typing to themselves
    const userId = key.slice(prefix.length);
    if (userId === user.id) continue;
    typing.push(entry.name);
  }

  return NextResponse.json(typing);
}
