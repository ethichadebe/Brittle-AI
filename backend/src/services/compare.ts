import type { ComparisonItem, ComparisonResult, StoreSlug } from "@accucery/types";
import { matchItem } from "./matchItem.js";
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
export async function compareList(
  items: CompareListItem[],
  targetStore: StoreSlug
): Promise<Comparison> {
  const results = await Promise.all(
    items.map(async (item): Promise<ComparisonItem> => {
      const match = await matchItem(
        { productId: item.productId, productName: item.productName, regularPrice: item.regularPrice },
        targetStore,
        search
      );

      if (!match.matched) {
        return {
          listItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          matched: false,
          reason: match.reason,
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
