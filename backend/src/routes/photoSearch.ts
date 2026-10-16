import type { FastifyInstance } from "fastify";
import { STORE_CONFIGS, type PhotoSearchRequest, type PhotoSearchResponse } from "@accucery/types";
import { LIMITS, limiter, tooMany } from "../rateLimit.js";
import { photoReaderFromEnv, type PhotoReader } from "../photoSearch/reader.js";

// Photo search (2026-10-16): the shopper photographs a product or a shopping
// list, and gets back what to search for. Signed-in shoppers only (the
// owner's choice): each photo costs a little to read, and an Account is what
// can be limited. The photo goes to Claude and nowhere else: it is never
// stored, and never logged.

const MEDIA_TYPES: readonly PhotoSearchRequest["mediaType"][] = ["image/jpeg", "image/png", "image/webp"];
/** About 3 MB of picture. The app shrinks a photo to well under that before sending it. */
export const MAX_IMAGE_CHARS = 4_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// The reader, from ANTHROPIC_API_KEY on first use; tests put in a fake.
let reader: PhotoReader | null | undefined;
const currentReader = () => (reader === undefined ? (reader = photoReaderFromEnv()) : reader);
/** Tests only: a stand-in for Claude, or null for "not set up". */
export function setPhotoReader(next: PhotoReader | null | undefined): void {
  reader = next;
}

export async function photoSearchRoutes(app: FastifyInstance) {
  // Whether to offer the camera at all.
  app.get<{ Reply: { available: boolean } }>("/search/photo", async () => ({ available: currentReader() !== null }));

  app.post<{ Body: Partial<PhotoSearchRequest> & { store?: string }; Reply: PhotoSearchResponse }>(
    "/search/photo",
    { bodyLimit: MAX_IMAGE_CHARS + 64 * 1024 },
    async (req, reply) => {
      if (!req.accountId) return reply.status(401).send({ error: "Sign in to search with a photo" } as never);
      const read = currentReader();
      if (!read) return reply.status(503).send({ error: "Photo search isn't available yet." } as never);

      const store = STORE_CONFIGS.find((s) => s.slug === req.body?.store && s.active);
      if (!store) return reply.status(400).send({ error: "Not a store Accucery searches" } as never);
      const { image, mediaType } = req.body ?? {};
      if (!mediaType || !MEDIA_TYPES.includes(mediaType)) {
        return reply.status(400).send({ error: "Send a JPEG, PNG or WebP photo" } as never);
      }
      if (typeof image !== "string" || !image || image.length > MAX_IMAGE_CHARS || !BASE64.test(image)) {
        return reply.status(400).send({ error: "That photo couldn't be read. Try another." } as never);
      }

      const wait = limiter.take(`photo:${req.accountId}`, LIMITS.photoSearchesPerAccount);
      if (wait) return tooMany(reply, wait, "photo searches");

      try {
        return { queries: await read({ image, mediaType, storeName: store.name }) };
      } catch (err) {
        // The error only: never the photo.
        req.log.error({ err: err instanceof Error ? err.message : String(err) }, "photo search failed");
        return reply.status(502).send({ error: "Couldn't read that photo just now. Try again in a minute." } as never);
      }
    }
  );
}
