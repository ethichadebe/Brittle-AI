import type { FastifyInstance } from "fastify";
import type { HistorySetting } from "@accucery/types";
import { ownerKey } from "../listOwnership.js";
import { historyOn, setHistory } from "../services/collect.js";

// The "Keep my shopping history" switch on Profile, for whoever owns the
// lists: the Account when signed in, else this device.
export async function historyRoutes(app: FastifyInstance) {
  app.get<{ Reply: HistorySetting }>("/history", async (req) => ({ on: await historyOn(ownerKey(req)) }));

  app.put<{ Body: { on?: unknown }; Reply: HistorySetting }>("/history", async (req, reply) => {
    if (typeof req.body?.on !== "boolean") return reply.status(400).send({ error: "Say on or off" } as never);
    await setHistory(ownerKey(req), req.body.on);
    return { on: req.body.on };
  });
}
