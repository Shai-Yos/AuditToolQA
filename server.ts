/**
 * Custom Node server hosting Next.js and Socket.IO on the same HTTP server.
 *
 * Required because a persistent WebSocket server needs a persistent Node
 * process — this won't work on serverless platforms, but this app runs on a
 * dedicated on-prem/VM host, so that's fine.
 *
 * Run in dev with `pnpm dev` / in production with `pnpm start` (both updated
 * in package.json to run this file via tsx instead of the `next` CLI).
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import nextEnv from "@next/env";

// The `next` CLI normally loads .env files automatically; since we're
// bypassing it with a custom server, load them the same way Next.js does
// before anything else (including "next" itself) is imported.
const dev = process.env.NODE_ENV !== "production";
nextEnv.loadEnvConfig(process.cwd(), dev);

const next = (await import("next")).default;
const { initSocketServer } = await import("./src/server/lib/socket");

const hostname = process.env.HOSTNAME ?? "localhost";
const port = Number(process.env.PORT ?? 3002);

const app = next({ dev, hostname, port, turbopack: dev });
const handle = app.getRequestHandler();

void app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
