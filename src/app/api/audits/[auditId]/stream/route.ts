import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { bus } from "@/server/lib/event-bus";
import { getAuditTabCounts } from "@/server/lib/audit-tab-counts";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { auditId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        } catch {
          // controller already closed
        }
      };

      // Initial heartbeat so the client knows it connected
      send("connected");

      void (async () => {
        try {
          const userId = session.user?.id;
          const counts = await getAuditTabCounts(auditId, userId || undefined);
          send(JSON.stringify({ type: "tab-counts", counts }));
        } catch {
          // no-op: stream should stay alive even if initial counts fail
        }
      })();

      const listener = (event: string) => send(event);
      bus.on(`audit:${auditId}`, listener);

      req.signal.addEventListener("abort", () => {
        bus.off(`audit:${auditId}`, listener);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
