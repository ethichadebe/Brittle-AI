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
import type { HealthResponse } from "@accucery/types";
import { CreditBudgetSpent } from "./scraper/creditBudget.js";

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    // The device-id cookie has to make the round trip for lists to be
    // scoped to anything, and a wildcard origin cannot be combined with it.
    credentials: true,
  });

  // #157: today's ScraperAPI allowance is spent. Whatever was asking (a
  // search, a comparison) answers with a plain message, not a 500.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof CreditBudgetSpent) return reply.status(503).send({ error: err.message });
    // Anything else: Fastify's own handling, as before.
    throw err;
  });

  // Every request after this point carries `req.deviceId` — see deviceId.ts.
  await registerDeviceId(app);
  // ...and `req.accountId` when signed in — see accountSession.ts. Requires
  // registerDeviceId to have already registered @fastify/cookie.
  await registerAccountSession(app);

  app.get<{ Reply: HealthResponse }>("/health", async () => ({ status: "ok" }));

  await app.register(listsRoutes);
  await app.register(listItemsRoutes);
  await app.register(searchRoutes);
  await app.register(imageProxyRoutes);
  await app.register(accountsRoutes);
  await app.register(compareRoutes);
  await app.register(substituteDecisionsRoutes);
  await app.register(recentProductsRoutes);

  return app;
}
