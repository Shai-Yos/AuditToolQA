/**
 * Short-lived, single-use tokens used to authenticate Socket.IO connections.
 *
 * The browser already has an authenticated NextAuth session (cookie-based),
 * but the raw Socket.IO handshake doesn't go through Next.js request/response
 * machinery, so we can't easily call `auth()` there. Instead, the client
 * fetches a token from `/api/socket-token` (a normal authenticated API route)
 * right before connecting, and the socket server exchanges it for a userId.
 *
 * Tokens are single-use and expire quickly — they only need to survive the
 * brief moment between the token fetch and the socket handshake.
 */
import { randomUUID } from "node:crypto";

const TOKEN_TTL_MS = 30_000;

type TokenEntry = { userId: string; expiresAt: number };

const g = globalThis as unknown as { __socketTokens?: Map<string, TokenEntry> };

if (!g.__socketTokens) {
  g.__socketTokens = new Map();
}

const tokens = g.__socketTokens;

export function issueSocketToken(userId: string): string {
  const token = randomUUID();
  tokens.set(token, { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/** Consumes (deletes) a token and returns the associated userId, or null if invalid/expired. */
export function consumeSocketToken(token: string): string | null {
  const entry = tokens.get(token);
  if (!entry) return null;
  tokens.delete(token);
  if (Date.now() > entry.expiresAt) return null;
  return entry.userId;
}

// Periodic cleanup of expired-but-unused tokens.
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (now > entry.expiresAt) tokens.delete(token);
  }
}, 60_000).unref();
