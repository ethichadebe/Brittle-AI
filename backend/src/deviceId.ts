import { randomUUID } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const DEVICE_ID_COOKIE = "accucery_device_id";

// 400 days is the longest `Max-Age` most browsers will honour rather than
// silently truncating (Chrome 104+, matching its own cap on cookie lifetime).
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

declare module "fastify" {
  interface FastifyRequest {
    deviceId: string;
  }
}

// Per ADR 0003, a Shopper without an Account is known only by the browser
// they are using — this is that identity. It is issued on first contact and
// read back on every request after, and it is what every list is scoped to
// (see lists.ts / listItems.ts) until #84's Account exists to claim it.
//
// Deliberately unsigned. The id space is a v4 UUID, so forging someone else's
// id means guessing 122 bits, not tampering with a value — signing would add
// a secret this repo would then have to guard for no real gain here.
export async function registerDeviceId(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const existing = req.cookies[DEVICE_ID_COOKIE];
    if (isValidDeviceId(existing)) {
      req.deviceId = existing;
      return;
    }

    // A missing or malformed cookie both get a fresh identity. A malformed one
    // is never treated as someone's real id — that would let a client hand us
    // an arbitrary string and have it silently accepted as an identity.
    const deviceId = randomUUID();
    req.deviceId = deviceId;
    reply.setCookie(DEVICE_ID_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  });
}
