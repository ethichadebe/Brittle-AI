import type { ComparisonMatch, Product, StoreSlug, SubstituteSource } from "@accucery/types";
import { parsePackSize } from "./packSize.js";

// Same shape #90's comparison result exposes over the wire — matching and
// comparing are two views of the same Substitute, so there is one type for
// it rather than a backend-internal one mapped to a public one at the door.
export type MatchedProduct = ComparisonMatch;

export interface Substitute {
  original: MatchedProduct;
  substitute: MatchedProduct;
}

// How many ranked candidates to offer as a manual pick when nothing scored
// confidently enough to auto-apply — a "not found" item is never a dead
// end when the search actually returned something plausible.
export const MAX_SUGGESTIONS = 3;

// Below this, even the closest candidate this search returned is too weak
// to auto-apply as the Substitute. It's offered as a suggestion instead of
// silently forced through or silently dropped — the same "won't guess"
// rule #89 already applies to an incomparable pack size, just applied to
// the name match itself.
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

// Ranks every candidate by word overlap with `itemName`, weighting each
// shared word by how rare it is across this search's own candidates. A
// brand or flavour word most of them share ("Mrs H.S. Ball's", "Chutney
// Flavoured") counts for little, so a candidate that only shares those
// doesn't outrank one that also shares the word that actually says what
// the product is ("Chips", found on no chutney jar). A word this search's
// candidates never used at all gets full weight, since there's no data
// here to say it's common.
function rankCandidates(itemName: string, candidates: Product[]): { product: Product; score: number }[] {
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
    .sort((a, b) => b.score - a.score);
}

export interface RemovedProduct {
  productId: string;
  name: string;
  imageUrl: string;
}

export type MatchResult =
  | {
      matched: true;
      substitute: Substitute;
      // Who chose it: Accucery's own match, the Shopper's own earlier pick
      // (#91), or a Popular Substitute other Shoppers chose (#103).
      source: SubstituteSource;
    }
  | {
      matched: false;
      reason: string;
      // The list item itself, judged by Unit Price — present only when
      // there's at least one suggestion to price it against.
      original?: MatchedProduct;
      // Up to MAX_SUGGESTIONS ranked candidates that weren't confident
      // enough to auto-apply, best first. Empty when nothing at the
      // target store even had a comparable, readable pack size at all.
      suggestions: MatchedProduct[];
      // Products the search returned that the Shopper had removed for
      // this item (#91), and so were left out.
      removed: RemovedProduct[];
    };

// What a Shopper has already decided about this item's Substitutes (#91).
export interface ShopperDecisions {
  // Products removed as a Substitute for this item — never applied or
  // suggested again.
  removed?: ReadonlySet<string>;
  // A Substitute picked for this item earlier, applied without asking
  // while the store still sells it.
  chosen?: { productId: string; name: string };
  // A Popular Substitute for this item (#103): what enough other Shoppers
  // chose. Outranked by the Shopper's own pick, and never applied if the
  // Shopper removed it.
  popular?: { productId: string; name: string };
}

function priced(product: Product, size: { quantity: number; unit: MatchedProduct["unit"] }): MatchedProduct {
  return {
    productId: product.productId,
    name: product.name,
    unitPrice: product.regularPrice / size.quantity,
    unit: size.unit,
    imageUrl: product.imageUrl,
  };
}

/**
 * Matches a list item to its equivalent at another store, per #89 / ADR
 * 0002. `search` is injected rather than imported so this can be tested
 * with a canned catalogue and no network access, the same substitution #74
 * built.
 */
export async function matchItem(
  item: { productId: string; productName: string; regularPrice: number; imageUrl: string },
  targetStore: StoreSlug,
  search: (store: StoreSlug, query: string) => Promise<Product[]>,
  decisions: ShopperDecisions = {}
): Promise<MatchResult> {
  const originalSize = parsePackSize(item.productName);
  const original: MatchedProduct | undefined = originalSize
    ? {
        productId: item.productId,
        name: item.productName,
        unitPrice: item.regularPrice / originalSize.quantity,
        unit: originalSize.unit,
        imageUrl: item.imageUrl,
      }
    : undefined;

  // A remembered pick, then a Popular Substitute, is looked for by its own
  // name: no store can be asked for a product by id, and searching for it
  // instead of for the list item keeps this to one search when it's still
  // there. Gone — or no longer comparable — falls through to the next, and
  // finally to ordinary matching; the decisions themselves are kept for
  // when it comes back.
  const removedIds = decisions.removed ?? new Set<string>();
  const remembered: { pick: { productId: string; name: string }; source: SubstituteSource }[] = [];
  if (decisions.chosen) remembered.push({ pick: decisions.chosen, source: "shopper" });
  if (decisions.popular && !removedIds.has(decisions.popular.productId)) {
    remembered.push({ pick: decisions.popular, source: "popular" });
  }
  if (originalSize && original) {
    for (const { pick, source } of remembered) {
      const found = (await search(targetStore, pick.name)).find((p) => p.productId === pick.productId);
      const foundSize = found && parsePackSize(found.name);
      if (found && foundSize && foundSize.unit === originalSize.unit) {
        return { matched: true, source, substitute: { original, substitute: priced(found, foundSize) } };
      }
    }
  }

  const results = await search(targetStore, item.productName);
  const removed = results
    .filter((p) => removedIds.has(p.productId))
    .map((p) => ({ productId: p.productId, name: p.name, imageUrl: p.imageUrl }));
  const candidates = results.filter((p) => !removedIds.has(p.productId));

  if (candidates.length === 0) {
    const reason =
      removed.length > 0
        ? `everything ${targetStore} has matching "${item.productName}" was removed by the shopper`
        : `${targetStore} has no products matching "${item.productName}"`;
    return { matched: false, reason, suggestions: [], removed };
  }

  if (!originalSize || !original) {
    return {
      matched: false,
      reason: `pack size could not be read from "${item.productName}"`,
      suggestions: [],
      removed,
    };
  }

  // Mass and volume are not the same dimension, and a candidate with no
  // readable Pack Size at all can't be priced by Unit Price either — both
  // are dropped from consideration entirely, never offered even as a
  // suggestion: #89 refuses a nonsensical "price per gram vs price per
  // millilitre" comparison rather than showing one.
  const viable: { candidate: MatchedProduct; score: number }[] = [];
  for (const { product, score } of rankCandidates(item.productName, candidates)) {
    const candidateSize = parsePackSize(product.name);
    if (!candidateSize || candidateSize.unit !== originalSize.unit) continue;
    viable.push({ candidate: priced(product, candidateSize), score });
  }

  if (viable.length === 0) {
    return {
      matched: false,
      reason: `${targetStore} has no candidate for "${item.productName}" with a comparable, readable pack size`,
      suggestions: [],
      removed,
    };
  }

  if (viable[0].score >= MIN_MATCH_SCORE) {
    return { matched: true, source: "accucery", substitute: { original, substitute: viable[0].candidate } };
  }

  return {
    matched: false,
    reason: `${targetStore}'s closest candidate for "${item.productName}" was "${viable[0].candidate.name}", too dissimilar to trust as a Substitute`,
    original,
    suggestions: viable.slice(0, MAX_SUGGESTIONS).map((v) => v.candidate),
    removed,
  };
}
