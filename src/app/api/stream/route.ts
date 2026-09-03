import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { bus } from "@/server/lib/event-bus";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

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
      bus.on("audits", listener);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        bus.off("audits", listener);
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
