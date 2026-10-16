import type { FastifyInstance } from "fastify";
import type { BarcodeLookupResponse } from "@accucery/types";
import { LIMITS, limiter, takeForIp, tooMany } from "../rateLimit.js";
import { createBarcodeLookup, isValidBarcode } from "../services/barcode.js";

// GET /products/barcode/:code: the product name for a barcode read from a
// photo on the shopper's phone (2026-10-16). Free, for everyone.
let lookup = createBarcodeLookup();
/** Tests only. */
export function setBarcodeLookup(next: (code: string) => Promise<string | null>): void {
  lookup = next;
}

export async function barcodeRoutes(app: FastifyInstance) {
  app.get<{ Params: { code: string }; Reply: BarcodeLookupResponse }>("/products/barcode/:code", async (req, reply) => {
    const code = req.params.code;
    if (!isValidBarcode(code)) return reply.status(400).send({ error: "That isn't a barcode Accucery can look up" } as never);

    const wait = Math.max(
      limiter.take(`barcode:${req.deviceId}`, LIMITS.barcodesPerDevice),
      takeForIp("barcode", req.ip, LIMITS.barcodesPerIp)
    );
    if (wait) return tooMany(reply, wait, "barcode lookups");

    try {
      return { code, name: await lookup(code) };
    } catch (err) {
      req.log.error({ err: err instanceof Error ? err.message : String(err) }, "barcode lookup failed");
      return reply.status(502).send({ error: "Couldn't look that barcode up just now. Try again in a minute." } as never);
    }
  });
}
