import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { auth } from "@/auth";
import { bus } from "@/server/lib/event-bus";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  // session.user.id is the Azure OID set in auth.config.ts — no DB lookup needed
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastChecked = new Date();
      const sendRaw = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // controller already closed
        }
      };

      const send = (data: string) => {
        sendRaw(`data: ${data}\n\n`);
      };

      // Ask clients to reconnect quickly if the stream drops.
      sendRaw("retry: 3000\n\n");

      // Send initial heartbeat
      send(JSON.stringify({ type: "connected" }));

      // Keep the stream warm through proxies/load balancers.
      const keepAlive = setInterval(() => sendRaw(": ping\n\n"), 15000);

      // Push new notifications when the event bus fires for this user
      const onNotification = async () => {
        try {
          const newNotifications = await db.notification.findMany({
            where: { userId, createdAt: { gt: lastChecked } },
            orderBy: { createdAt: "asc" },
          });

          if (newNotifications.length > 0) {
            lastChecked = newNotifications[newNotifications.length - 1]!.createdAt;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const unreadCount = await db.notification.count({
              where: { userId, read: false, createdAt: { gte: todayStart } },
            });
            send(JSON.stringify({ type: "new", notifications: newNotifications, unreadCount }));
          }
        } catch {
          // DB error — skip this tick
        }
      };

      bus.on(`notifications:${userId}`, onNotification);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        bus.off(`notifications:${userId}`, onNotification);
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
