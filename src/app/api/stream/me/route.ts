import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/server/db";
import { bus } from "@/server/lib/event-bus";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return new Response("User not found", { status: 404 });
  }

  const userId = user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendRaw = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // controller already closed
        }
      };

      const send = (event: string) => {
        sendRaw(`data: ${event}\n\n`);
      };

      // Ask clients to reconnect quickly if the stream drops.
      sendRaw("retry: 3000\n\n");

      send("connected");

      // Keep the stream warm through proxies/load balancers.
      const keepAlive = setInterval(() => sendRaw(": ping\n\n"), 15000);

      const listener = (event: string) => send(event);
      bus.on(`user:${userId}`, listener);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        bus.off(`user:${userId}`, listener);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
