import Fastify from "fastify";
import cors from "@fastify/cors";
import { listsRoutes } from "./routes/lists.js";
import { listItemsRoutes } from "./routes/listItems.js";
import { searchRoutes } from "./routes/search.js";
import { imageProxyRoutes } from "./routes/imageProxy.js";
import type { HealthResponse } from "@accucery/types";

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  });

  app.get<{ Reply: HealthResponse }>("/health", async () => ({ status: "ok" }));

  await app.register(listsRoutes);
  await app.register(listItemsRoutes);
  await app.register(searchRoutes);
  await app.register(imageProxyRoutes);

  return app;
}
