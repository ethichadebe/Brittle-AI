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

// Below this, even the closest candidate this search returned is too weak
// to trust as a Substitute — refusing here is the same "won't guess" rule
// applied just below to an incomparable pack size, applied to the name
// match itself instead.
const MIN_MATCH_SCORE = 0.3;

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

// Picks the best of `candidates` by word overlap with `itemName`, same as
// nameSimilarity, but weights each shared word by how rare it is across
// this search's own candidates. A brand or flavour word that shows up on
// most of them ("Mrs H.S. Ball's", "Chutney Flavoured") counts for little,
// so a candidate that only shares those doesn't outrank one that also
// shares the word that actually says what the product is ("Chips" not
// found on any chutney jar). A word this search's candidates never used at
// all gets full weight, since there's no data here to say it's common.
function bestCandidate(itemName: string, candidates: Product[]): { product: Product; score: number } {
  const itemTokens = tokenize(itemName);
  const candidateTokens = candidates.map((c) => tokenize(c.name));

  const documentFrequency = new Map<string, number>();
  for (const tokens of candidateTokens) {
    for (const t of tokens) documentFrequency.set(t, (documentFrequency.get(t) ?? 0) + 1);
  }
  const weight = (t: string): number => 1 / (documentFrequency.get(t) ?? 1);

  let best = { product: candidates[0], score: -1 };
  candidates.forEach((product, i) => {
    const tokens = candidateTokens[i];
    const union = new Set([...itemTokens, ...tokens]);
    let sharedWeight = 0;
    let unionWeight = 0;
    for (const t of union) {
      const w = weight(t);
      unionWeight += w;
      if (itemTokens.has(t) && tokens.has(t)) sharedWeight += w;
    }
    const score = unionWeight === 0 ? 0 : sharedWeight / unionWeight;
    if (score > best.score) best = { product, score };
  });

  return best;
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

  const { product: best, score } = bestCandidate(item.productName, candidates);
  if (score < MIN_MATCH_SCORE) {
    return {
      matched: false,
      reason:
        `${targetStore}'s closest candidate for "${item.productName}" was "${best.name}", ` +
        `too dissimilar to trust as a Substitute`,
    };
  }

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
