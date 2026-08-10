/**
 * Socket.IO server for real-time chat + transcription updates.
 *
 * Scope (intentionally narrow): this only handles chat messages and typing
 * indicators for audit chat/transcription channels. All authorization for
 * writes (posting/editing/deleting messages) still happens in the existing
 * REST routes (src/app/api/audits/[auditId]/chat/*) — sockets are only used
 * to broadcast the result of those writes to other connected clients, and to
 * relay ephemeral typing events. Everything else (meta, requests, kanban,
 * tab-counts, notifications) still uses the existing SSE/event-bus.
 *
 * Single-instance design: no Redis adapter. If this app is ever deployed
 * across multiple Node instances/replicas, this won't fan out between them
 * (same limitation as the existing in-memory event-bus).
 */
import { Server as IOServer, type Socket } from "socket.io";
import type { Server as HTTPServer } from "node:http";
import { consumeSocketToken } from "@/server/lib/socketAuthTokens";
import { getCachedUser } from "@/server/lib/userPrivilegeCache";

type SocketData = { userId: string; userName: string };

const g = globalThis as unknown as { __io?: IOServer };

export function chatRoom(auditId: string, channel: string): string {
  return `chat:${auditId}:${channel}`;
}

/** Returns the existing Socket.IO server instance, if one has been initialized. */
export function getIO(): IOServer | null {
  return g.__io ?? null;
}

/** Initializes (once) the Socket.IO server on top of the given HTTP server. */
export function initSocketServer(httpServer: HTTPServer): IOServer {
  if (g.__io) return g.__io;

  const io = new IOServer(httpServer, {
    path: "/socket.io",
  });

  io.use((socket, next) => {
    void (async () => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) {
          next(new Error("Unauthorized"));
          return;
        }
        const userId = consumeSocketToken(token);
        if (!userId) {
          next(new Error("Unauthorized"));
          return;
        }
        const user = await getCachedUser(userId);
        if (!user) {
          next(new Error("Unauthorized"));
          return;
        }
        const data: SocketData = { userId: user.id, userName: user.name ?? user.email ?? "Someone" };
        socket.data = data;
        next();
      } catch {
        next(new Error("Unauthorized"));
      }
    })();
  });

  io.on("connection", (socket: Socket) => {
    const { userId, userName } = socket.data as SocketData;

    // Any authenticated user may join a channel room to *receive* updates —
    // this matches the existing GET /chat semantics, which lets any
    // authenticated user read messages. Write authorization is still fully
    // enforced server-side in the REST routes.
    socket.on("chat:join", (payload: { auditId?: string; channel?: string }, ack?: (ok: boolean) => void) => {
      const { auditId, channel } = payload ?? {};
      if (!auditId || !channel) {
        ack?.(false);
        return;
      }
      void socket.join(chatRoom(auditId, channel));
      ack?.(true);
    });

    socket.on("chat:leave", (payload: { auditId?: string; channel?: string }) => {
      const { auditId, channel } = payload ?? {};
      if (!auditId || !channel) return;
      void socket.leave(chatRoom(auditId, channel));
    });

    socket.on("chat:typing", (payload: { auditId?: string; channel?: string }) => {
      const { auditId, channel } = payload ?? {};
      if (!auditId || !channel) return;
      socket.to(chatRoom(auditId, channel)).emit("chat:typing", { userId, name: userName });
    });

    socket.on("chat:typing:stop", (payload: { auditId?: string; channel?: string }) => {
      const { auditId, channel } = payload ?? {};
      if (!auditId || !channel) return;
      socket.to(chatRoom(auditId, channel)).emit("chat:typing:stop", { userId, name: userName });
    });
  });

  g.__io = io;
  return io;
}
