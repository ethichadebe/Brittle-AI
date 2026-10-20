import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { DEVICE_ID_COOKIE, isValidDeviceId, useDeviceId } from "../deviceId.js";
import { createHandoff, safePath, takeHandoff } from "../handoff.js";
import { appUrl } from "../mail/mailer.js";

// The app's old address hands each visitor on to the new one, FRONTEND_URL,
// bringing their lists with them (#200, handoff.ts). The server's own nginx
// sends every page of the old address to /handoff/send, naming the page
// asked for in X-Handoff-To, and its /sw.js to /handoff/sw.js.

// Replaces the app's service worker on the old address with one that removes
// itself and reloads the page, so a cached copy of the app can't keep running
// there, calling an API that now only forwards.
export const RETIRING_SERVICE_WORKER = `// The app has moved (#200). This removes the old address's service worker.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration
      .unregister()
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url))))
  );
});
`;

export async function handoffRoutes(app: FastifyInstance) {
  app.get("/handoff/send", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const base = appUrl();
    // Asked for on the new address itself: FRONTEND_URL hasn't been changed
    // yet, and forwarding would only come straight back here.
    if (req.hostname === new URL(base).host) {
      return reply.status(409).type("text/plain").send("FRONTEND_URL is still this address, so there is nowhere to send you.");
    }
    const to = safePath(req.headers["x-handoff-to"]);
    const own = req.cookies[DEVICE_ID_COOKIE];
    const code = isValidDeviceId(own) ? createHandoff(own) : null;
    if (!code) return reply.redirect(base + to, 302);
    return reply.redirect(`${base}/api/handoff/receive?code=${encodeURIComponent(code)}&to=${encodeURIComponent(to)}`, 302);
  });

  app.get<{ Querystring: { code?: string; to?: string } }>("/handoff/receive", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const to = safePath(req.query.to);
    const carried = takeHandoff(req.query.code);
    if (carried && carried !== req.deviceId && !req.accountId) {
      const own = await prisma.list.count({ where: { userId: req.deviceId } });
      if (own === 0) useDeviceId(req, reply, carried);
    }
    return reply.redirect(to, 302);
  });

  app.get("/handoff/sw.js", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return reply.type("text/javascript").send(RETIRING_SERVICE_WORKER);
  });
}
