import type { ComparisonItem, ComparisonResult, ComparisonSuggestion, StoreSlug } from "@accucery/types";
import { matchItem, type ShopperDecisions } from "./matchItem.js";
import { search } from "./search.js";

interface CompareListItem {
  id: string;
  productId: string;
  productName: string;
  regularPrice: number;
  quantity: number;
}

export type Comparison = Omit<ComparisonResult, "storeSlug">;

// Per ADR 0002 / #90: every item is priced against the target store, never
// dropped — an unmatched item stays in the result rather than silently
// vanishing, which is what would let a store that stocks less look cheaper.
// `decisions` is the Shopper's remembered picks and removals (#91), keyed
// by the list item's productId; an anonymous or brand-new Shopper has none.
export async function compareList(
  items: CompareListItem[],
  targetStore: StoreSlug,
  decisions: ReadonlyMap<string, ShopperDecisions> = new Map()
): Promise<Comparison> {
  const results = await Promise.all(
    items.map(async (item): Promise<ComparisonItem> => {
      const match = await matchItem(
        { productId: item.productId, productName: item.productName, regularPrice: item.regularPrice },
        targetStore,
        search,
        decisions.get(item.productId)
      );

      if (!match.matched) {
        // Suggestions are priced the same way a confident Substitute is —
        // by the shopper's own quantity's worth of base units, recovered
        // from the original's own Unit Price — so picking one client-side
        // is a pure re-sum, no second round trip.
        let suggestions: ComparisonSuggestion[] = [];
        if (match.original && match.suggestions.length > 0) {
          const originalPackQuantity = item.regularPrice / match.original.unitPrice;
          const neededBaseUnits = item.quantity * originalPackQuantity;
          suggestions = match.suggestions.map((substitute) => ({
            substitute,
            cost: neededBaseUnits * substitute.unitPrice,
          }));
        }

        return {
          listItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          matched: false,
          reason: match.reason,
          suggestions,
          removed: match.removed,
        };
      }

      // How many base units (grams or millilitres) the shopper's own
      // quantity represents, recovered from the original's price and Unit
      // Price rather than re-parsing its Pack Size a second time. Costing
      // the Substitute by that same need, not by "one pack for one pack",
      // is the whole point of judging by Unit Price (ADR 0002): a smaller
      // pack of the substitute must not look like a cheaper like-for-like.
      const originalPackQuantity = item.regularPrice / match.substitute.original.unitPrice;
      const neededBaseUnits = item.quantity * originalPackQuantity;
      const cost = neededBaseUnits * match.substitute.substitute.unitPrice;

      return {
        listItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        matched: true,
        original: match.substitute.original,
        substitute: match.substitute.substitute,
        cost,
        chosenByShopper: match.chosenByShopper,
      };
    })
  );

  const unmatchedCount = results.filter((r) => !r.matched).length;
  const total = results.reduce((sum, r) => (r.matched ? sum + r.cost : sum), 0);

  return {
    items: results,
    total,
    unmatchedCount,
    itemCount: results.length,
    complete: unmatchedCount === 0,
  };
}
