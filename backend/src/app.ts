import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerDeviceId } from "./deviceId.js";
import { listsRoutes } from "./routes/lists.js";
import { listItemsRoutes } from "./routes/listItems.js";
import { searchRoutes } from "./routes/search.js";
import { imageProxyRoutes } from "./routes/imageProxy.js";
import type { HealthResponse } from "@accucery/types";

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    // The device-id cookie has to make the round trip for lists to be
    // scoped to anything, and a wildcard origin cannot be combined with it.
    credentials: true,
  });

  // Every request after this point carries `req.deviceId` — see deviceId.ts.
  await registerDeviceId(app);

  app.get<{ Reply: HealthResponse }>("/health", async () => ({ status: "ok" }));

  await app.register(listsRoutes);
  await app.register(listItemsRoutes);
  await app.register(searchRoutes);
  await app.register(imageProxyRoutes);

  return app;
}
