import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { auth } from "@/auth";

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
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Track the latest notification ID we've sent so we only push new ones
      const latest = await db.notification.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      let lastChecked = latest?.createdAt ?? new Date();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Send initial heartbeat
      send(JSON.stringify({ type: "connected" }));

      const poll = async () => {
        if (closed) return;
        try {
          const newNotifications = await db.notification.findMany({
            where: {
              userId,
              createdAt: { gt: lastChecked },
            },
            orderBy: { createdAt: "asc" },
          });

          if (newNotifications.length > 0) {
            lastChecked = newNotifications[newNotifications.length - 1]!.createdAt;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const unreadCount = await db.notification.count({
              where: { userId, read: false, createdAt: { gte: todayStart } },
            });
            send(
              JSON.stringify({
                type: "new",
                notifications: newNotifications,
                unreadCount,
              }),
            );
          }
        } catch {
          // DB error — skip this tick
        }

        if (!closed) {
          setTimeout(() => void poll(), 3000);
        }
      };

      // Start polling loop
      void poll();

      // Handle client disconnect via abort signal
      req.signal.addEventListener("abort", () => {
        closed = true;
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
