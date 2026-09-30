import type { ComparisonMatch, Product, StoreSlug } from "@accucery/types";
import { parsePackSize } from "./packSize.js";

// Same shape #90's comparison result exposes over the wire — matching and
// comparing are two views of the same Substitute, so there is one type for
// it rather than a backend-internal one mapped to a public one at the door.
export type MatchedProduct = ComparisonMatch;

// How many ranked candidates a shopper is shown per item — enough to offer
// a real choice without asking them to read a whole search result.
export const MAX_CANDIDATES = 3;

export interface Substitute {
  original: MatchedProduct;
  // Ranked candidates at the target store, best first, never auto-picked.
  // Word-overlap matching (below) can still rank a wrong product above a
  // right one — the fix is putting the choice in front of the shopper, not
  // pretending the algorithm can always tell on its own.
  candidates: MatchedProduct[];
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

// Ranks every candidate by word overlap with `itemName`, weighting each
// shared word by how rare it is across this search's own candidates. A
// brand or flavour word most of them share ("Mrs H.S. Ball's", "Chutney
// Flavoured") counts for little, so a candidate that only shares those
// doesn't outrank one that also shares the word that actually says what
// the product is ("Chips", found on no chutney jar). A word this search's
// candidates never used at all gets full weight, since there's no data
// here to say it's common.
function rankCandidates(itemName: string, candidates: Product[]): Product[] {
  const itemTokens = tokenize(itemName);
  const candidateTokens = candidates.map((c) => tokenize(c.name));

  const documentFrequency = new Map<string, number>();
  for (const tokens of candidateTokens) {
    for (const t of tokens) documentFrequency.set(t, (documentFrequency.get(t) ?? 0) + 1);
  }
  const weight = (t: string): number => 1 / (documentFrequency.get(t) ?? 1);

  return candidates
    .map((product, i) => {
      const tokens = candidateTokens[i];
      const union = new Set([...itemTokens, ...tokens]);
      let sharedWeight = 0;
      let unionWeight = 0;
      for (const t of union) {
        const w = weight(t);
        unionWeight += w;
        if (itemTokens.has(t) && tokens.has(t)) sharedWeight += w;
      }
      return { product, score: unionWeight === 0 ? 0 : sharedWeight / unionWeight };
    })
    .sort((a, b) => b.score - a.score)
    .map((r) => r.product);
}

/**
 * Finds candidate Substitutes for a list item at another store, per #89 /
 * ADR 0002. `search` is injected rather than imported so this can be tested
 * with a canned catalogue and no network access, the same substitution #74
 * built.
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

  const originalSize = parsePackSize(item.productName);
  if (!originalSize) {
    return { matched: false, reason: `pack size could not be read from "${item.productName}"` };
  }

  // Mass and volume are not the same dimension, and a candidate with no
  // readable Pack Size at all can't be priced by Unit Price either — both
  // are dropped here rather than offered as a choice, per #89: never let a
  // nonsensical "price per gram vs price per millilitre" comparison stand
  // in for a Substitute just because its name ranked well.
  const viable: MatchedProduct[] = [];
  for (const product of rankCandidates(item.productName, candidates)) {
    if (viable.length >= MAX_CANDIDATES) break;
    const candidateSize = parsePackSize(product.name);
    if (!candidateSize || candidateSize.unit !== originalSize.unit) continue;
    viable.push({
      productId: product.productId,
      name: product.name,
      unitPrice: product.regularPrice / candidateSize.quantity,
      unit: candidateSize.unit,
    });
  }

  if (viable.length === 0) {
    return {
      matched: false,
      reason: `${targetStore} has no candidate for "${item.productName}" with a comparable, readable pack size`,
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
      candidates: viable,
    },
  };
}
