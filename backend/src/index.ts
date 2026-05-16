import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma } from "./db.js";
import type { HealthResponse } from "@accucery/types";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
});

app.get<{ Reply: HealthResponse }>("/health", async () => {
  return { status: "ok" };
});

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

try {
  await app.listen({ port: 3000, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
