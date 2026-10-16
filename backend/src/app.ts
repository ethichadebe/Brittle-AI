import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerDeviceId } from "./deviceId.js";
import { registerAccountSession } from "./accountSession.js";
import { listsRoutes } from "./routes/lists.js";
import { listItemsRoutes } from "./routes/listItems.js";
import { searchRoutes } from "./routes/search.js";
import { imageProxyRoutes } from "./routes/imageProxy.js";
import { accountsRoutes } from "./routes/accounts.js";
import { compareRoutes } from "./routes/compare.js";
import { substituteDecisionsRoutes } from "./routes/substituteDecisions.js";
import { recentProductsRoutes } from "./routes/recentProducts.js";
import { premiumRoutes } from "./routes/premium.js";
import { crawlerRoutes } from "./routes/crawlers.js";
import { ownerRoutes } from "./routes/owner.js";
import { barcodeRoutes } from "./routes/barcode.js";
import type { HealthResponse } from "@accucery/types";
import { responded } from "./alerts/serverErrors.js";
import { redactingStream } from "./logRedact.js";

export async function buildApp(
  opts: { logger?: boolean; logStream?: { write(line: string): unknown }; trustProxy?: number | false } = {}
) {
  const app = Fastify({
    // #88: every line is written through redactingStream, which masks any
    // email address in it. logStream is for tests; the server logs to stdout.
    logger: opts.logger || opts.logStream ? { stream: redactingStream(opts.logStream) } : false,
    // The visitor's address, for per-IP limits (rateLimit.ts). In production a
    // request passes two proxies, each adding to X-Forwarded-For: the host's
    // nginx (README, "If this host already uses port 80"), then the frontend
    // container's. So the visitor is two hops back, and anything a visitor
    // writes into the header themselves sits further left and is ignored.
    trustProxy: opts.trustProxy ?? (process.env.NODE_ENV === "production" ? 2 : false),
  });

  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    // The device-id cookie has to make the round trip for lists to be
    // scoped to anything, and a wildcard origin cannot be combined with it.
    credentials: true,
  });

  // Every request after this point carries `req.deviceId` — see deviceId.ts.
  await registerDeviceId(app);
  // ...and `req.accountId` when signed in — see accountSession.ts. Requires
  // registerDeviceId to have already registered @fastify/cookie.
  await registerAccountSession(app);

  // Every response's status, by route pattern, for the server error alert
  // (alerts/serverErrors.ts).
  app.addHook("onResponse", async (req, reply) => {
    responded(reply.statusCode, `${req.method} ${req.routeOptions.url ?? "(no route)"}`);
  });

  app.get<{ Reply: HealthResponse }>("/health", async () => ({ status: "ok" }));

  await app.register(listsRoutes);
  await app.register(listItemsRoutes);
  await app.register(searchRoutes);
  await app.register(imageProxyRoutes);
  await app.register(accountsRoutes);
  await app.register(compareRoutes);
  await app.register(substituteDecisionsRoutes);
  await app.register(recentProductsRoutes);
  await app.register(premiumRoutes);
  await app.register(crawlerRoutes);
  await app.register(ownerRoutes);
  await app.register(barcodeRoutes);

  return app;
}
