import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import type {
  ComparisonMatchedItem,
  ComparisonResult,
  ComparisonUnmatchedItem,
  GroceryList,
  ListItem,
  Product,
  StoreSlug,
  SubstituteChoice,
} from "@accucery/types";
import { api, ApiError, imgSrc } from "../lib/api";
import { computeSummary } from "../lib/summary";
import { priceAge } from "../lib/priceAge";
import { useAnimatedMount } from "../hooks/useAnimatedMount";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { useLoyaltySettings } from "../hooks/useLoyaltySettings";
import { useAccountSession } from "../hooks/useAccountSession";

// Long enough to swallow a burst of keystrokes, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 350;

// While any price on the list is being refreshed, ask again this often —
// one item takes a few seconds to scrape — and give up after this long, so
// a refresh that never reports back can't keep the page asking forever.
const PRICE_POLL_MS = 3000;
const PRICE_POLL_LIMIT_MS = 2 * 60 * 1000;

export const Route = createFileRoute("/lists/$listId")({
  component: ListPage,
});

function ListPage() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<ListItem[]>([]);
  const [listName, setListName] = useState("");
  const [storeSlug, setStoreSlug] = useState<StoreSlug | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [query, setQuery] = useState("");
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const { account } = useAccountSession();
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [excludedItems, setExcludedItems] = useState<Set<string>>(new Set());
  // For an unmatched item that came with suggestions (nothing scored
  // confidently enough to auto-apply): which one, if any, the shopper has
  // picked as the actual Substitute. Picking one counts it in the total
  // right away, same as a confident match already does.
  const [selectedSuggestion, setSelectedSuggestion] = useState<Map<string, number>>(new Map());
  const { isEnabled } = useLoyaltySettings();
  const useLoyalty = storeSlug ? isEnabled(storeSlug) : false;
  const summary = computeSummary(items, useLoyalty);
  const searchRef = useRef<HTMLInputElement>(null);

  const animUnchecked = useAnimatedNumber(summary.unchecked);
  const animPriceToPay = useAnimatedNumber(summary.priceToPay);
  const animTotal = useAnimatedNumber(summary.total);

  const confirm = useAnimatedMount(showConfirm);

  useEffect(() => {
    api.items.list(listId).then(setItems).catch(console.error);
    api.lists.list().then((lists) => {
      const found = lists.find((l) => l.id === listId) as GroceryList | undefined;
      if (found) { setListName(found.name); setStoreSlug(found.storeSlug); }
    });
  }, [listId]);

  // #77: opening a list returns its prices at once and refreshes old ones
  // in the background, so the page keeps asking until none are updating.
  const pollingSince = useRef<number | null>(null);
  const updatingPrices = items.some((i) => i.priceStatus === "updating");
  const outdatedPrices = items.some((i) => i.priceStatus === "outdated");
  useEffect(() => {
    if (!updatingPrices) {
      pollingSince.current = null;
      return;
    }
    pollingSince.current ??= Date.now();
    if (Date.now() - pollingSince.current > PRICE_POLL_LIMIT_MS) return;
    const timer = setTimeout(() => {
      api.items.list(listId).then(setItems).catch(console.error);
    }, PRICE_POLL_MS);
    return () => clearTimeout(timer);
  }, [items, updatingPrices, listId]);

  useEffect(() => {
    if (showSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, [showSearch]);

  // Wait for a pause in typing before searching. The backend runs one scrape at
  // a time per store, so a request per keystroke queues up behind itself:
  // typing "banana" measured 18.6s against 2.9s for a single search. That reads
  // as a broken Checkers search, while Pick n Pay — six times faster per
  // request — still looks fine.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!query.trim() || !storeSlug) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      api.search(storeSlug, query.trim(), controller.signal)
        .then((products) => { if (!controller.signal.aborted) setSearchResults(products); })
        .catch(() => { if (!controller.signal.aborted) setSearchResults([]); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, storeSlug]);

  const closeSearch = () => { setShowSearch(false); setQuery(""); setSearchResults([]); };
  const closeConfirm = () => { setShowConfirm(false); };

  // Per ADR 0004, comparing is the one thing an anonymous Shopper cannot do
  // — prompted to sign in, never silently blocked or silently allowed.
  const openCompare = () => {
    if (!account) { setShowSignInPrompt(true); return; }
    setShowStorePicker(true);
  };

  const runCompare = async (targetStore: StoreSlug) => {
    setShowStorePicker(false);
    setComparing(true);
    setCompareError(null);
    try {
      const result = await api.lists.compare(listId, targetStore);
      setComparison(result);
      setExcludedItems(new Set());
      setSelectedSuggestion(new Map());
    } catch (e) {
      setCompareError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setComparing(false);
    }
  };

  const closeComparison = () => { setComparison(null); setCompareError(null); };

  // #91: a deliberate pick or removal is remembered against the Shopper's
  // Account so the next Comparison doesn't ask again; `null` forgets one.
  // The sheet updates instantly either way — a failed save only costs the
  // memory, never this comparison.
  const rememberDecision = (
    fromProductId: string,
    to: { productId: string; name: string },
    choice: SubstituteChoice | null
  ) => {
    if (!comparison || !storeSlug) return;
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
    if (!comparison || !storeSlug) return;
    const targetStore = comparison.storeSlug;
    try {
      await Promise.all(
        item.removed.map((r) =>
          api.substitutes.forget({ fromStore: storeSlug, fromProductId: item.productId, toStore: targetStore, toProductId: r.productId })
        )
      );
    } catch (e) {
      setCompareError(e instanceof ApiError ? e.message : "Couldn't undo that removal");
      return;
    }
    await runCompare(targetStore);
  };

  // The photo of the shopper's own list item, shown beside its stand-in.
  // Already loaded with the list, so the comparison doesn't carry it.
  const ownImage = (listItemId: string) => items.find((i) => i.id === listItemId)?.imageUrl ?? "";

  const storeName = (slug: StoreSlug) => STORE_CONFIGS.find((s) => s.slug === slug)?.name ?? slug;

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

  const addItem = async (product: Product) => {
    // A second tap on another result, before the first add has round-tripped,
    // must not also go through — otherwise a burst of taps adds every item
    // the shopper touched, not just the one they meant to.
    if (addingItem) return;
    setAddingItem(true);
    try {
      const existing = items.find((i) => i.productId === product.productId);
      if (existing) {
        const updated = await api.items.patch(listId, existing.id, { quantity: existing.quantity + 1 });
        setItems((prev) => prev.map((i) => (i.id === existing.id ? updated : i)));
      } else {
        const item = await api.items.add(listId, {
          productId: product.productId,
          productName: product.name,
          imageUrl: product.imageUrl,
          regularPrice: product.regularPrice,
          loyaltyPrice: product.loyaltyPrice,
        });
        setItems((prev) => [...prev, item]);
      }
      closeSearch();
    } finally {
      setAddingItem(false);
    }
  };

  const changeQty = async (item: ListItem, delta: number) => {
    const next = item.quantity + delta;
    if (next < 1) {
      setPendingDeleteId(item.id);
      setShowConfirm(true);
      return;
    }
    const updated = await api.items.patch(listId, item.id, { quantity: next });
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const toggleCheck = async (item: ListItem) => {
    const updated = await api.items.patch(listId, item.id, { isChecked: !item.isChecked });
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    closeConfirm();
    setSwipingId(null);
    setPendingDeleteId(null);
    api.items.delete(listId, id).catch((e) => {
      console.error("Failed to delete item:", e);
      api.items.list(listId).then(setItems).catch(console.error);
    });
  };

  const price = (item: ListItem) =>
    useLoyalty && item.loyaltyPrice !== null ? item.loyaltyPrice : item.regularPrice;

  const pendingItem = items.find((i) => i.id === pendingDeleteId);

  return (
    <>
    <div className="page-slide-in">
      {/* Header */}
      <header className="list-header">
        <button className="btn-back" onClick={() => navigate({ to: "/" })}>‹</button>
        <h2 className="list-title">{listName || "List"}</h2>
        <div className="list-header-actions">
          <button className="btn-icon btn-icon--dark" title="Compare at another store" onClick={openCompare}>⇄</button>
          <button className="btn-icon btn-icon--dark" onClick={() => navigate({ to: "/settings" })}>⚙</button>
        </div>
      </header>

      {/* Summary bar */}
      <div className="summary-bar">
        <div className="summary-cell">
          <span className="summary-label">Unchecked</span>
          <span className="summary-value">R {animUnchecked.toFixed(2)}</span>
        </div>
        <div className="summary-cell summary-cell--highlight">
          <span className="summary-label">Price to pay</span>
          <span className="summary-value">R {animPriceToPay.toFixed(2)}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Total</span>
          <span className="summary-value">R {animTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* #77: a total isn't one to rely on until every price in it is current */}
      {(updatingPrices || outdatedPrices) && (
        <p className="summary-provisional">
          {updatingPrices
            ? "Updating prices… totals may change"
            : "Some prices couldn't be updated — totals may be out of date"}
        </p>
      )}

      {/* Item list */}
      <ul className="item-list">
        {items.length === 0 && (
          <li className="item-empty">No items yet — tap + to search</li>
        )}
        {[...items].sort((a, b) => Number(a.isChecked) - Number(b.isChecked)).map((item) => (
          <li
            key={item.id}
            className={`item-row${item.isChecked ? " item-row--checked" : ""}${swipingId === item.id ? " item-row--swiping" : ""}`}
          >
            {swipingId === item.id && (
              <button
                className="item-delete-reveal"
                onClick={() => { setPendingDeleteId(item.id); setShowConfirm(true); }}
              >
                🗑
              </button>
            )}

            <img className="item-img" src={imgSrc(item.imageUrl)} alt={item.productName} />

            <div className="item-info" onClick={() => toggleCheck(item)}>
              <span className="item-name">{item.productName}</span>
              <span className="item-price">
                R {price(item).toFixed(2)}
                {item.loyaltyPrice !== null && item.loyaltyPrice !== item.regularPrice && (
                  <span className="item-loyalty-price"> · R {item.loyaltyPrice.toFixed(2)}</span>
                )}
                {" "}× {item.quantity} = R {(price(item) * item.quantity).toFixed(2)}
              </span>
              {item.priceStatus === "updating" && <span className="item-price-status">updating…</span>}
              {item.priceStatus === "outdated" && (
                <span className="item-price-status item-price-status--outdated">
                  {item.priceObservedAt
                    ? `price from ${priceAge(item.priceObservedAt)}, couldn't update`
                    : "couldn't update this price"}
                </span>
              )}
            </div>

            <div className="item-qty">
              <button className="qty-btn" onClick={() => changeQty(item, -1)}>−</button>
              <span className="qty-value">{item.quantity}</span>
              <button className="qty-btn" onClick={() => changeQty(item, 1)}>+</button>
              <button
                className="btn-icon item-swipe-btn"
                onClick={() => setSwipingId(swipingId === item.id ? null : item.id)}
              >
                ⋮
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* FAB */}
      <button className="fab" onClick={() => setShowSearch(true)}>+</button>
    </div>

      {/* Delete confirmation modal — outside page-slide-in so position:fixed is viewport-relative */}
      {confirm.rendered && (
        <div
          className={`modal-backdrop${confirm.closing ? " modal-backdrop--closing" : ""}`}
          onClick={closeConfirm}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Remove item?</h3>
            <p style={{ margin: "0.5rem 0 1.25rem", color: "#6b7280", fontSize: "0.9rem" }}>
              {pendingItem?.productName}
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeConfirm}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => pendingDeleteId && deleteItem(pendingDeleteId)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search bottom sheet — always rendered so the input is in the DOM for instant focus on mobile */}
      <div
        className={`search-overlay${showSearch ? " search-overlay--open" : ""}`}
        onClick={closeSearch}
      >
        <div className="search-sheet" onClick={(e) => e.stopPropagation()}>
          <input
            ref={searchRef}
            className="modal-input"
            placeholder="Search products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className={`search-results${addingItem ? " search-results--busy" : ""}`}>
            {searching && (
              <li className="item-empty">Searching…</li>
            )}
            {!searching && query.trim() && searchResults.length === 0 && (
              <li className="item-empty">No products found</li>
            )}
            {!searching && !query.trim() && (
              <li className="item-empty">Type to search products</li>
            )}
            {searchResults.map((product) => (
              <li
                key={product.productId}
                className="search-result-row"
                onClick={() => addItem(product)}
              >
                <img className="item-img" src={imgSrc(product.imageUrl)} alt={product.name} />
                <div className="item-info">
                  <span className="item-name">{product.name}</span>
                  <span className="item-price">
                    R {product.regularPrice.toFixed(2)}
                    {product.loyaltyPrice !== null && (
                      <span className="item-loyalty-price"> · R {product.loyaltyPrice.toFixed(2)}</span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sign-in prompt — per ADR 0004, compare is the one thing an
          anonymous Shopper cannot do */}
      {showSignInPrompt && (
        <div className="modal-backdrop" onClick={() => setShowSignInPrompt(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sign in to compare</h3>
            <p style={{ margin: "0.5rem 0 1.25rem", color: "#6b7280", fontSize: "0.9rem" }}>
              Comparing a list against another store needs an account, so it can't be spent without limit.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowSignInPrompt(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => navigate({ to: "/account" })}>Sign in</button>
            </div>
          </div>
        </div>
      )}

      {/* Store picker */}
      {showStorePicker && (
        <div className="modal-backdrop" onClick={() => setShowStorePicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Compare against which store?</h3>
            <ul className="compare-store-options">
              {STORE_CONFIGS.filter((s) => s.active && s.slug !== storeSlug).map((s) => (
                <li key={s.slug} className="compare-store-option" onClick={() => runCompare(s.slug)}>
                  <span className="compare-store-swatch" style={{ background: s.color }} />
                  {s.name}
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowStorePicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Comparing in progress */}
      {comparing && (
        <div className="modal-backdrop">
          <div className="modal" style={{ textAlign: "center" }}>
            <h3>Comparing prices…</h3>
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>This can take a moment for a longer list.</p>
          </div>
        </div>
      )}

      {/* Compare error */}
      {compareError && !comparing && (
        <div className="modal-backdrop" onClick={() => setCompareError(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Couldn't compare</h3>
            <p style={{ margin: "0.5rem 0 1.25rem", color: "#6b7280", fontSize: "0.9rem" }}>{compareError}</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setCompareError(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison result */}
      {comparison && (
        <div className="search-overlay search-overlay--open" onClick={closeComparison}>
          <div className="compare-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="compare-sheet-header">
              <h3>vs {storeName(comparison.storeSlug)}</h3>
              <button className="btn-icon" onClick={closeComparison}>✕</button>
            </div>

            {!comparison.complete && (
              <p className="compare-incomplete-note">
                {comparison.unmatchedCount} of {comparison.itemCount} items not found at {storeName(comparison.storeSlug)}
              </p>
            )}

            <div className="compare-total">
              <span className="summary-label">Estimated total</span>
              <span className="compare-total-value">R {liveTotal.toFixed(2)}</span>
            </div>

            <ul className="compare-items">
              {comparison.items.map((item) => (
                <li key={item.listItemId} className="compare-item-row">
                  {item.matched ? (
                    <>
                      <input
                        type="checkbox"
                        className="compare-item-checkbox"
                        checked={!excludedItems.has(item.listItemId)}
                        onChange={() => toggleExcluded(item)}
                      />
                      <img className="compare-thumb" src={imgSrc(item.substitute.imageUrl)} alt="" />
                      <div className="item-info">
                        <span className="item-name">
                          {item.substitute.name}
                          <span className="substitute-badge">{item.chosenByShopper ? "Your pick" : "Substitute"}</span>
                        </span>
                        <span className="compare-item-was">
                          <img className="compare-thumb compare-thumb--small" src={imgSrc(ownImage(item.listItemId))} alt="" />
                          was: {item.productName}
                        </span>
                        <span className="item-price">R {item.cost.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="compare-item-checkbox-spacer" />
                      <img
                        className="compare-thumb compare-item-info--unmatched"
                        src={imgSrc(ownImage(item.listItemId))}
                        alt=""
                      />
                      <div className="item-info">
                        <div className="compare-item-info--unmatched">
                          <span className="item-name">{item.productName}</span>
                          <span className="compare-item-unmatched-note">
                            Not found at {storeName(comparison.storeSlug)}
                          </span>
                        </div>
                        {item.removed.length > 0 && (
                          <span className="compare-item-removed-note">
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
                          <ul className="compare-candidate-list">
                            {item.suggestions.map((suggestion, index) => (
                              <li
                                key={suggestion.substitute.productId}
                                className={`compare-candidate${selectedSuggestion.get(item.listItemId) === index ? " compare-candidate--chosen" : ""}`}
                                onClick={() => selectSuggestion(item, index)}
                              >
                                <img className="compare-thumb" src={imgSrc(suggestion.substitute.imageUrl)} alt="" />
                                <span className="item-name">{suggestion.substitute.name}</span>
                                <span className="item-price">R {suggestion.cost.toFixed(2)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
