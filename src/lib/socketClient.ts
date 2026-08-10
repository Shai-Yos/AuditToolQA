"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/**
 * Returns a shared Socket.IO client connection for the current browser tab.
 * Lazily created on first call. Authenticates by fetching a fresh, short-lived
 * token from /api/socket-token on every (re)connection attempt — this keeps
 * working across reconnects (e.g. after a server restart or network blip)
 * without the client having to manage token refresh itself.
 */
export function getSocket(): Socket {
  if (typeof window === "undefined") {
    throw new Error("getSocket() must only be called in the browser (e.g. inside useEffect)");
  }
  if (socket) return socket;

  socket = io({
    path: "/socket.io",
    auth: (cb) => {
      fetch("/api/socket-token")
        .then((res) => res.json())
        .then((data: { token?: string }) => cb({ token: data.token }))
        .catch(() => cb({}));
    },
  });

  return socket;
}
