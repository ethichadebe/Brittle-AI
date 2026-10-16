import Anthropic from "@anthropic-ai/sdk";
import type { PhotoSearchRequest } from "@accucery/types";

// Photo search (2026-10-16): Claude reads a photo of a product or a shopping
// list (printed or handwritten) and answers what a shopper would type to find
// each one. The owner's choice of model is Haiku 5.5: a phone photo costs well
// under a cent to read. The photo is never kept or logged here.

export const PHOTO_MODEL = "claude-haiku-5-5";
export const MAX_QUERIES = 10;
const MAX_QUERY_LENGTH = 80;

/** Reads one photo into search terms. */
export type PhotoReader = (photo: PhotoSearchRequest & { storeName: string }) => Promise<string[]>;

const SYSTEM = [
  "You read photos for Accucery, a South African grocery price app.",
  "The photo shows either grocery or pharmacy products, or a shopping list (printed or handwritten).",
  "Answer what a shopper would type into the store's own website search to find each product, in the order they appear.",
  "For a product, use its brand, name and size when you can read them, like \"Clover full cream milk 2L\". For a list, one search per line item, as written but spelled correctly.",
  "Leave out prices, quantities like \"x2\", people, and anything that isn't something a grocery store or pharmacy sells.",
  "If there's nothing usable, answer with an empty list.",
].join(" ");

const SCHEMA = {
  type: "object",
  properties: { queries: { type: "array", items: { type: "string" } } },
  required: ["queries"],
  additionalProperties: false,
} as const;

/** Trims, de-duplicates and caps what came back, whoever it came from. */
export function cleanQueries(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const query = item.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH).trim();
    const key = query.toLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length === MAX_QUERIES) break;
  }
  return out;
}

/** The real reader, or null when ANTHROPIC_API_KEY isn't set: photo search is then off. */
export function photoReaderFromEnv(): PhotoReader | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });

  return async ({ image, mediaType, storeName }) => {
    const response = await client.messages.create({
      model: PHOTO_MODEL,
      max_tokens: 1024,
      // Reading a label or a list doesn't need deep thought; low keeps it quick.
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: `The shopper is searching ${storeName}.` },
          ],
        },
      ],
    });
    // A declined photo (Haiku has no fallback) reads as nothing found.
    if (response.stop_reason === "refusal") return [];
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return [];
    try {
      return cleanQueries((JSON.parse(text.text) as { queries?: unknown }).queries);
    } catch {
      return [];
    }
  };
}
