import { useState } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import type {
  ComparisonMatchedItem,
  ComparisonResult,
  ComparisonUnmatchedItem,
  ListItem,
  StoreSlug,
  SubstituteChoice,
  SubstituteSource,
} from "@accucery/types";
import { api, ApiError, imgSrc } from "../lib/api";
import { formatRand } from "../lib/format";
import { Disclaimer } from "./Disclaimer";
import { CheckIcon, CloseIcon } from "./icons";

// Who put a Substitute in a comparison total, as the shopper reads it.
const SOURCE_BADGE: Record<SubstituteSource, string> = {
  accucery: "Substitute",
  shopper: "Your pick",
  popular: "Popular pick",
};

const storeOf = (slug: StoreSlug) => STORE_CONFIGS.find((s) => s.slug === slug);
const storeName = (slug: StoreSlug) => storeOf(slug)?.name ?? slug;

interface CompareFlowProps {
  listId: string;
  // The list's own store, left out of the stores to compare against.
  storeSlug: StoreSlug;
  // The list's items, for the photo of each beside its stand-in. Already
  // loaded with the list, so the comparison doesn't carry them.
  items: ListItem[];
  signedIn: boolean;
  onSignIn: () => void;
  onClose: () => void;
}

// Comparing a list against another store (#90, restyled in #116): sign-in
// prompt, store picker, the wait, then the results sheet.
export function CompareFlow({ listId, storeSlug, items, signedIn, onSignIn, onClose }: CompareFlowProps) {
  const [comparingAt, setComparingAt] = useState<StoreSlug | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [excludedItems, setExcludedItems] = useState<Set<string>>(new Set());
  // For an unmatched item that came with suggestions (nothing scored
  // confidently enough to auto-apply): which one, if any, the shopper has
  // picked as the actual Substitute. Picking one counts it in the total
  // right away, same as a confident match already does.
  const [selectedSuggestion, setSelectedSuggestion] = useState<Map<string, number>>(new Map());

  const runCompare = async (targetStore: StoreSlug) => {
    setComparingAt(targetStore);
    setError(null);
    try {
      const result = await api.lists.compare(listId, targetStore);
      setComparison(result);
      setExcludedItems(new Set());
      setSelectedSuggestion(new Map());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setComparingAt(null);
    }
  };

  // #91: a deliberate pick or removal is remembered against the Shopper's
  // Account so the next Comparison doesn't ask again; `null` forgets one.
  // The sheet updates instantly either way — a failed save only costs the
  // memory, never this comparison.
  const rememberDecision = (
    fromProductId: string,
    to: { productId: string; name: string },
    choice: SubstituteChoice | null
  ) => {
    if (!comparison) return;
    const pairing = { fromStore: storeSlug, fromProductId, toStore: comparison.storeSlug, toProductId: to.productId };
    const saved = choice
      ? api.substitutes.decide({ ...pairing, toProductName: to.name, choice })
      : api.substitutes.forget(pairing);
    saved.catch((e) => console.error("Failed to remember Substitute decision:", e));
  };

  // Unticking a Substitute removes it; ticking it again forgets the removal.
  const toggleExcluded = (item: ComparisonMatchedItem) => {
    const removing = !excludedItems.has(item.listItemId);
    setExcludedItems((prev) => {
      const next = new Set(prev);
      if (removing) next.add(item.listItemId);
      else next.delete(item.listItemId);
      return next;
    });
    rememberDecision(item.productId, item.substitute, removing ? "removed" : null);
  };

  // Tapping the already-picked suggestion again un-picks it — back to
  // "not found", excluded from the total, not stuck once tapped. Un-picking
  // forgets the pick rather than recording a removal: changing your mind
  // about a tap isn't a judgement on the product.
  const selectSuggestion = (item: ComparisonUnmatchedItem, index: number) => {
    const unpicking = selectedSuggestion.get(item.listItemId) === index;
    setSelectedSuggestion((prev) => {
      const next = new Map(prev);
      if (unpicking) next.delete(item.listItemId);
      else next.set(item.listItemId, index);
      return next;
    });
    rememberDecision(item.productId, item.suggestions[index].substitute, unpicking ? null : "chosen");
  };

  // Forgets every removal that left this item unmatched, then compares
  // again so the options it had come back.
  const undoRemovals = async (item: ComparisonUnmatchedItem) => {
    if (!comparison) return;
    const targetStore = comparison.storeSlug;
    try {
      await Promise.all(
        item.removed.map((r) =>
          api.substitutes.forget({ fromStore: storeSlug, fromProductId: item.productId, toStore: targetStore, toProductId: r.productId })
        )
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't undo that removal");
      return;
    }
    await runCompare(targetStore);
  };

  const ownImage = (listItemId: string) => items.find((i) => i.id === listItemId)?.imageUrl ?? "";

  // Recomputed on the client so unchecking a Substitute, or picking a
  // suggestion for an item that wasn't confidently matched, is instant —
  // the backend already priced every option, this is just which ones count.
  const liveTotal = comparison
    ? comparison.items.reduce((sum, item) => {
        if (item.matched) return excludedItems.has(item.listItemId) ? sum : sum + item.cost;
        const chosen = selectedSuggestion.get(item.listItemId);
        if (chosen === undefined) return sum;
        const suggestion = item.suggestions[chosen];
        return suggestion ? sum + suggestion.cost : sum;
      }, 0)
    : 0;

  // Per ADR 0004, comparing is the one thing an anonymous Shopper cannot do
  // — prompted to sign in, never silently blocked or silently allowed.
  if (!signedIn) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Sign in to compare</h3>
          <p className="modal-body">
            Comparing a list against another store needs an account, so it can't be spent without limit.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={onSignIn}>Sign in</button>
          </div>
        </div>
      </div>
    );
  }

  if (comparingAt) {
    return (
      <div className="modal-backdrop">
        <div className="modal compare-wait" role="status">
          <span className="spinner" aria-hidden="true" />
          <h3>Comparing prices at {storeName(comparingAt)}…</h3>
          <p className="modal-body">This can take a moment for a longer list.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-backdrop" onClick={() => (comparison ? setError(null) : onClose())}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Couldn't compare</h3>
          <p className="modal-body">{error}</p>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => (comparison ? setError(null) : onClose())}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" role="dialog" aria-label="Compare prices at" onClick={(e) => e.stopPropagation()}>
          <h3>Compare prices at…</h3>
          <p className="modal-body">Your whole list, matched product by product at another store.</p>
          <div className="store-tiles compare-store-tiles">
            {STORE_CONFIGS.filter((s) => s.active && s.slug !== storeSlug).map((s) => (
              <button key={s.slug} className="store-tile" onClick={() => runCompare(s.slug)}>
                <span className="store-tile-swatch" style={{ background: s.color }} />
                <span className="store-tile-name">{s.name}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const target = storeOf(comparison.storeSlug);
  const targetName = storeName(comparison.storeSlug);

  return (
    <div className="search-overlay search-overlay--open" onClick={onClose}>
      <div className="compare-sheet" role="dialog" aria-label={`Compared at ${targetName}`} onClick={(e) => e.stopPropagation()}>
        <div className="compare-sheet-header">
          <div>
            <span className="compare-sheet-kicker">Your list at</span>
            <h3>
              <span className="store-dot" style={{ background: target?.color }} />
              {targetName}
            </h3>
          </div>
          <button className="compare-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="compare-total">
          <span className="compare-total-label">Estimated total</span>
          <span className="compare-total-value">{formatRand(liveTotal)}</span>
          {!comparison.complete && (
            <span className="compare-incomplete-note">
              {comparison.unmatchedCount} of {comparison.itemCount} items not found at {targetName}, so not counted
            </span>
          )}
        </div>

        <ul className="compare-items">
          {comparison.items.map((item) =>
            item.matched ? (
              <li key={item.listItemId} className={`compare-row${excludedItems.has(item.listItemId) ? " compare-row--off" : ""}`}>
                <button
                  className={`tick${excludedItems.has(item.listItemId) ? "" : " tick--on"}`}
                  role="checkbox"
                  aria-checked={!excludedItems.has(item.listItemId)}
                  aria-label={`Count ${item.substitute.name} in the total`}
                  onClick={() => toggleExcluded(item)}
                >
                  {!excludedItems.has(item.listItemId) && <CheckIcon size={15} />}
                </button>
                <img className="compare-thumb" src={imgSrc(item.substitute.imageUrl)} alt="" />
                <div className="compare-meta">
                  <span className="compare-name">
                    {item.substitute.name}
                    <span className={`substitute-badge substitute-badge--${item.source}`}>{SOURCE_BADGE[item.source]}</span>
                  </span>
                  <span className="compare-was">
                    <img className="compare-thumb compare-thumb--small" src={imgSrc(ownImage(item.listItemId))} alt="" />
                    instead of {item.productName}
                  </span>
                </div>
                <span className="compare-cost">{formatRand(item.cost)}</span>
              </li>
            ) : (
              <li key={item.listItemId} className="compare-row compare-row--unmatched">
                <span className="compare-row-spacer" />
                <img className="compare-thumb compare-thumb--faded" src={imgSrc(ownImage(item.listItemId))} alt="" />
                <div className="compare-meta">
                  <span className="compare-name compare-name--faded">{item.productName}</span>
                  <span className="compare-not-found">Not found at {targetName}</span>
                  {item.removed.length > 0 && (
                    <span className="compare-removed-note">
                      You removed
                      {item.removed.map((r) => (
                        <span key={r.productId} className="compare-removed-product">
                          <img className="compare-thumb compare-thumb--small" src={imgSrc(r.imageUrl)} alt="" />
                          {r.name}
                        </span>
                      ))}
                      <button className="compare-undo" onClick={() => undoRemovals(item)}>Undo</button>
                    </span>
                  )}
                  {item.suggestions.length > 0 && (
                    <>
                      <span className="compare-pick-hint">Close matches. Pick one to count it:</span>
                      <ul className="compare-candidate-list">
                        {item.suggestions.map((suggestion, index) => {
                          const chosen = selectedSuggestion.get(item.listItemId) === index;
                          return (
                            <li key={suggestion.substitute.productId}>
                              <button
                                className={`compare-candidate${chosen ? " compare-candidate--chosen" : ""}`}
                                aria-pressed={chosen}
                                onClick={() => selectSuggestion(item, index)}
                              >
                                <img className="compare-thumb" src={imgSrc(suggestion.substitute.imageUrl)} alt="" />
                                <span className="compare-candidate-name">{suggestion.substitute.name}</span>
                                <span className="compare-cost">{formatRand(suggestion.cost)}</span>
                                <span className={`compare-radio${chosen ? " compare-radio--on" : ""}`} aria-hidden="true">
                                  {chosen && <CheckIcon size={13} />}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </li>
            )
          )}
          <Disclaimer as="li" className="compare-disclaimer" />
        </ul>
      </div>
    </div>
  );
}
