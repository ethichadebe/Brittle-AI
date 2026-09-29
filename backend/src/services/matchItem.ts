import type { ComparisonMatch, Product, StoreSlug } from "@accucery/types";
import { parsePackSize } from "./packSize.js";

// Same shape #90's comparison result exposes over the wire — matching and
// comparing are two views of the same Substitute, so there is one type for
// it rather than a backend-internal one mapped to a public one at the door.
export type MatchedProduct = ComparisonMatch;

export interface Substitute {
  original: MatchedProduct;
  substitute: MatchedProduct;
}

export type MatchResult = { matched: true; substitute: Substitute } | { matched: false; reason: string };

function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

// A plain word-overlap score, not full text search — good enough to rank
// candidates a scraper's own search already narrowed down to "plausible".
export function nameSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

/**
 * Matches a list item to its equivalent at another store, per #89 / ADR 0002.
 * `search` is injected rather than imported so this can be tested with a
 * canned catalogue and no network access, the same substitution #74 built.
 */
export async function matchItem(
  item: { productId: string; productName: string; regularPrice: number },
  targetStore: StoreSlug,
  search: (store: StoreSlug, query: string) => Promise<Product[]>
): Promise<MatchResult> {
  const candidates = await search(targetStore, item.productName);
  if (candidates.length === 0) {
    return { matched: false, reason: `${targetStore} has no products matching "${item.productName}"` };
  }

  const best = candidates.reduce((a, b) =>
    nameSimilarity(item.productName, b.name) > nameSimilarity(item.productName, a.name) ? b : a
  );

  const originalSize = parsePackSize(item.productName);
  if (!originalSize) {
    return { matched: false, reason: `pack size could not be read from "${item.productName}"` };
  }

  const candidateSize = parsePackSize(best.name);
  if (!candidateSize) {
    return { matched: false, reason: `pack size could not be read from "${best.name}"` };
  }

  // Mass and volume are not the same dimension — 500 g of one product and
  // 2 L of another cannot be judged against each other by Unit Price at
  // all, so this is a refusal, not a worse comparison.
  if (candidateSize.unit !== originalSize.unit) {
    return {
      matched: false,
      reason:
        `pack size units are not comparable for "${item.productName}" ` +
        `(${originalSize.quantity}${originalSize.unit}) and "${best.name}" ` +
        `(${candidateSize.quantity}${candidateSize.unit})`,
    };
  }

  return {
    matched: true,
    substitute: {
      original: {
        productId: item.productId,
        name: item.productName,
        unitPrice: item.regularPrice / originalSize.quantity,
        unit: originalSize.unit,
      },
      substitute: {
        productId: best.productId,
        name: best.name,
        unitPrice: best.regularPrice / candidateSize.quantity,
        unit: candidateSize.unit,
      },
    },
  };
}
