import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import type {
  ComparisonMatchedItem,
  ComparisonResult,
  ComparisonUnmatchedItem,
  GroceryList,
  ListItem,
  StoreSlug,
  SubstituteChoice,
  SubstituteSource,
} from "@accucery/types";
import { api, ApiError, imgSrc } from "../lib/api";
import { computeSummary } from "../lib/summary";
import { priceAge } from "../lib/priceAge";
import { formatRand } from "../lib/format";
import { restoreList, withoutList } from "../lib/listOrder";
import { useAnimatedMount } from "../hooks/useAnimatedMount";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { useLoyaltySettings } from "../hooks/useLoyaltySettings";
import { useAccountSession } from "../hooks/useAccountSession";
import { useDeferredDelete } from "../hooks/useDeferredDelete";
import { useStoredFlag } from "../hooks/useStoredFlag";
import {
  CheckIcon,
  ChevronIcon,
  MinusIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  SwapIcon,
  TrashIcon,
} from "../components/icons";
import { AddItems } from "../components/AddItems";

// Who put a Substitute in a comparison total, as the shopper reads it.
const SOURCE_BADGE: Record<SubstituteSource, string> = {
  accucery: "Substitute",
  shopper: "Your pick",
  popular: "Popular pick",
};

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
  const [loaded, setLoaded] = useState(false);
  const [listName, setListName] = useState("");
  const [storeSlug, setStoreSlug] = useState<StoreSlug | null>(null);
  const [adding, setAdding] = useState(false);
  // "5 items added", shown briefly after the add screen closes.
  const [addedNote, setAddedNote] = useState<string | null>(null);
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
  const [trolleyFolded, setTrolleyFolded] = useStoredFlag("accucery:trolleyFolded", false);
  const [menuOpen, setMenuOpen] = useState(false);

  const animTotal = useAnimatedNumber(summary.total);

  // Items deleted but still inside their undo window: a reload (the #77
  // price polling, say) mustn't bring them back on screen meanwhile.
  const deleting = useRef(new Set<string>());
  const showItems = (all: ListItem[]) => setItems(all.filter((i) => !deleting.current.has(i.id)));
  const reloadItems = () => api.items.list(listId).then(showItems).catch(console.error);

  useEffect(() => {
    api.items
      .list(listId)
      .then((all) => {
        showItems(all);
        setLoaded(true);
      })
      .catch(console.error);
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
    const timer = setTimeout(reloadItems, PRICE_POLL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadItems is rebuilt each render; listId is what it depends on
  }, [items, updatingPrices, listId]);

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

  // Ticking is optimistic: in a shop aisle a tick has to land at once, not
  // after a round trip. If the server refuses, the list is reloaded as it is.
  const patchItem = (item: ListItem, patch: Partial<Pick<ListItem, "quantity" | "isChecked">>) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    api.items.patch(listId, item.id, patch).catch((e) => {
      console.error("Failed to update item:", e);
      void reloadItems();
    });
  };

  const toggleCheck = (item: ListItem) => patchItem(item, { isChecked: !item.isChecked });

  // #113: never below 1 — taking an item off the list is Delete, not 0.
  const setQuantity = (item: ListItem, quantity: number) => {
    if (quantity < 1 || quantity === item.quantity) return;
    patchItem(item, { quantity });
  };

  const deletion = useDeferredDelete<ListItem>(
    (item) => api.items.delete(listId, item.id).finally(() => deleting.current.delete(item.id)),
    (item, index) => {
      deleting.current.delete(item.id);
      setItems((prev) => restoreList(prev, item, index));
    }
  );

  const removeItem = (item: ListItem) => {
    const { lists: rest, index } = withoutList(items, item.id);
    if (index === -1) return;
    deleting.current.add(item.id);
    setItems(rest);
    deletion.remove(item, index);
  };

  // #113: the item detail sheet. The id it was last opened for is kept while
  // it animates closed, so its content doesn't blank mid-exit.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lastDetailId, setLastDetailId] = useState<string | null>(null);
  const detailSheet = useAnimatedMount(detailId !== null);
  const detailItem = items.find((i) => i.id === (detailId ?? lastDetailId));
  const openDetail = (item: ListItem) => {
    setDetailId(item.id);
    setLastDetailId(item.id);
  };
  // An item deleted from elsewhere (or by its own Delete) closes its sheet.
  if (detailId !== null && loaded && !items.some((i) => i.id === detailId)) setDetailId(null);

  // Rename, from the header's ⋮
  const [renaming, setRenaming] = useState(false);
  const renameSheet = useAnimatedMount(renaming);
  const [renameTo, setRenameTo] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const startRename = () => {
    setMenuOpen(false);
    setRenameTo(listName);
    setRenameError(null);
    setRenaming(true);
  };
  const saveRename = async () => {
    const name = renameTo.trim();
    if (!name) return;
    if (name === listName) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    try {
      await api.lists.rename(listId, name);
      setListName(name);
      setRenaming(false);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRenameSaving(false);
    }
  };

  const store = STORE_CONFIGS.find((s) => s.slug === storeSlug);

  // From the add screen (#114): an item it added or merged into, or one it
  // took back off.
  const savedItem = (item: ListItem) =>
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item]));
  const removedItem = (itemId: string) => setItems((prev) => prev.filter((i) => i.id !== itemId));

  const finishAdding = (count: number) => {
    setAdding(false);
    if (count > 0) setAddedNote(`${count} item${count === 1 ? "" : "s"} added`);
  };
  useEffect(() => {
    if (!addedNote) return;
    const timer = setTimeout(() => setAddedNote(null), 3000);
    return () => clearTimeout(timer);
  }, [addedNote]);
  const toGet = items.filter((i) => !i.isChecked);
  const inTrolley = items.filter((i) => i.isChecked);
  const progress = summary.itemCount > 0 ? summary.checkedCount / summary.itemCount : 0;

  const row = (item: ListItem) => (
    <ItemRow
      key={item.id}
      item={item}
      useLoyalty={useLoyalty}
      onToggle={() => toggleCheck(item)}
      onOpen={() => openDetail(item)}
      onDelete={() => removeItem(item)}
    />
  );

  return (
    <>
    <div className="page-slide-in list-page">
      <header className="list-top">
        <button className="btn-back" aria-label="Back" onClick={() => navigate({ to: "/" })}>‹</button>
        <div className="list-top-title">
          <h1>{listName || "List"}</h1>
          {store && (
            <span className="store-label">
              <span className="store-dot" style={{ background: store.color }} />
              {store.name}
            </span>
          )}
        </div>
        <button
          className="list-card-more"
          aria-label="List options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <MoreIcon />
        </button>
        {menuOpen && (
          <>
            <div className="menu-dismiss" onClick={() => setMenuOpen(false)} />
            <div className="card-menu list-top-menu" role="menu">
              <button role="menuitem" onClick={startRename}>
                <PencilIcon />
                Rename list
              </button>
              <button role="menuitem" onClick={() => navigate({ to: "/profile" })}>
                <SettingsIcon />
                Loyalty cards &amp; profile
              </button>
            </div>
          </>
        )}
        <div className="list-progress" aria-hidden="true">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      {loaded && items.length === 0 && (
        <div className="list-empty">
          <p className="list-empty-title">Nothing on this list yet</p>
          <p>Tap <strong>Add</strong> to find products at {store?.name ?? "this store"}.</p>
        </div>
      )}

      <ul className="items">{toGet.map(row)}</ul>

      {inTrolley.length > 0 && (
        <section className="trolley">
          <button
            className="trolley-head"
            aria-expanded={!trolleyFolded}
            onClick={() => setTrolleyFolded(!trolleyFolded)}
          >
            <span>In trolley · {inTrolley.length}</span>
            <ChevronIcon up={!trolleyFolded} />
          </button>
          {!trolleyFolded && <ul className="items">{inTrolley.map(row)}</ul>}
        </section>
      )}
    </div>

      {/* Bottom bar, outside page-slide-in so position:fixed is viewport-relative */}
      <div className="list-bar">
        {deletion.undoable && (
          <div className="snackbar snackbar--docked" role="status">
            <span className="snackbar-text">Item deleted</span>
            <button className="snackbar-action" onClick={deletion.undo}>UNDO</button>
          </div>
        )}
        {addedNote && !deletion.undoable && (
          <div className="snackbar snackbar--docked" role="status">
            <span className="snackbar-text">{addedNote}</span>
          </div>
        )}
        <button
          className={`add-pill${deletion.undoable || addedNote ? " add-pill--raised" : ""}`}
          onClick={() => setAdding(true)}
        >
          <PlusIcon />
          Add
        </button>
        <div className="list-bar-total">
          <span className="list-bar-amount">{formatRand(animTotal)}</span>
          <span className="list-bar-sub">
            {formatRand(summary.priceToPay)} in trolley · {summary.checkedCount} of {summary.itemCount}
          </span>
          {/* #77: a total isn't one to rely on until every price in it is current */}
          {(updatingPrices || outdatedPrices) && (
            <span className={`list-bar-note${updatingPrices ? "" : " list-bar-note--outdated"}`}>
              {updatingPrices
                ? "Updating prices… total may change"
                : "Some prices couldn't be updated"}
            </span>
          )}
        </div>
        <button className="compare-btn" disabled={items.length === 0} onClick={openCompare}>
          <SwapIcon />
          Compare prices
        </button>
      </div>

      {adding && storeSlug && (
        <AddItems
          listId={listId}
          storeSlug={storeSlug}
          storeName={store?.name ?? storeSlug}
          useLoyalty={useLoyalty}
          items={items}
          onSaved={savedItem}
          onRemoved={removedItem}
          onDone={finishAdding}
        />
      )}

      {detailSheet.rendered && detailItem && (
        <ItemSheet
          item={detailItem}
          useLoyalty={useLoyalty}
          closing={detailSheet.closing}
          onClose={() => setDetailId(null)}
          onQuantity={(q) => setQuantity(detailItem, q)}
          onDelete={() => {
            setDetailId(null);
            removeItem(detailItem);
          }}
        />
      )}

      {renameSheet.rendered && (
        <div
          className={`modal-backdrop${renameSheet.closing ? " modal-backdrop--closing" : ""}`}
          onClick={() => setRenaming(false)}
        >
          <div className="modal" role="dialog" aria-label="Rename list" onClick={(e) => e.stopPropagation()}>
            <h3>Rename list</h3>
            <input
              className="modal-input"
              aria-label="List name"
              autoFocus
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
            />
            {renameError && <p className="form-error">{renameError}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setRenaming(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!renameTo.trim() || renameSaving} onClick={saveRename}>
                {renameSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign-in prompt — per ADR 0004, compare is the one thing an
          anonymous Shopper cannot do */}
      {showSignInPrompt && (
        <div className="modal-backdrop" onClick={() => setShowSignInPrompt(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sign in to compare</h3>
            <p style={{ margin: "0.5rem 0 1.25rem", color: "var(--muted)", fontSize: "0.9rem" }}>
              Comparing a list against another store needs an account, so it can't be spent without limit.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowSignInPrompt(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => navigate({ to: "/sign-in", search: { then: `/lists/${listId}` } })}>Sign in</button>
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
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>This can take a moment for a longer list.</p>
          </div>
        </div>
      )}

      {/* Compare error */}
      {compareError && !comparing && (
        <div className="modal-backdrop" onClick={() => setCompareError(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Couldn't compare</h3>
            <p style={{ margin: "0.5rem 0 1.25rem", color: "var(--muted)", fontSize: "0.9rem" }}>{compareError}</p>
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
                          <span className={`substitute-badge substitute-badge--${item.source}`}>{SOURCE_BADGE[item.source]}</span>
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

const linePrice = (item: ListItem, useLoyalty: boolean) =>
  useLoyalty && item.loyaltyPrice !== null ? item.loyaltyPrice : item.regularPrice;

// The loyalty price only matters where it's actually lower.
const hasCardPrice = (item: ListItem) => item.loyaltyPrice !== null && item.loyaltyPrice < item.regularPrice;

function PriceStatus({ item }: { item: ListItem }) {
  if (item.priceStatus === "updating") return <span className="item-price-status">updating…</span>;
  if (item.priceStatus === "outdated") {
    return (
      <span className="item-price-status item-price-status--outdated">
        {item.priceObservedAt
          ? `price from ${priceAge(item.priceObservedAt)}, couldn't update`
          : "couldn't update this price"}
      </span>
    );
  }
  return null;
}

// How far left a row must be dragged, as a share of its width, to delete it.
const SWIPE_DELETE_SHARE = 0.35;

interface ItemRowProps {
  item: ListItem;
  useLoyalty: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}

// One item (#112): tick circle, photo, name, "qty × price", line total.
// Tapping the circle ticks it; tapping anywhere else opens its details
// (#113); swiping it left far enough deletes it, with UNDO.
function ItemRow({ item, useLoyalty, onToggle, onOpen, onDelete }: ItemRowProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const gesture = useRef<{ x: number; y: number; width: number; horizontal: boolean | null } | null>(null);
  const dragged = useRef(false);
  const price = linePrice(item, useLoyalty);
  const cardPrice = hasCardPrice(item);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth, horizontal: null };
    dragged.current = false;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      dragged.current = true;
      g.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!g.horizontal) {
        gesture.current = null;
        return;
      }
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setDrag(Math.min(0, dx));
  };

  const onPointerEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.horizontal || drag === null) return;
    if (-drag > g.width * SWIPE_DELETE_SHARE) {
      // Slide the rest of the way out, then go.
      setLeaving(true);
      setTimeout(onDelete, 160);
    }
    setDrag(null);
  };

  const unlessDragged = (action: () => void) => () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    action();
  };

  const offset = leaving ? "-100%" : `${drag ?? 0}px`;

  return (
    <li className="item-swipe">
      <div className="item-swipe-bg" aria-hidden="true">
        <TrashIcon />
      </div>
      <div
        className={`item${item.isChecked ? " item--checked" : ""}${drag !== null ? " item--dragging" : ""}`}
        style={{ transform: `translateX(${offset})` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={unlessDragged(onOpen)}
      >
        <button
          className={`tick${item.isChecked ? " tick--on" : ""}`}
          role="checkbox"
          aria-checked={item.isChecked}
          aria-label={item.isChecked ? `Take ${item.productName} out of the trolley` : `Put ${item.productName} in the trolley`}
          onClick={(e) => {
            e.stopPropagation();
            unlessDragged(onToggle)();
          }}
        >
          {item.isChecked && <CheckIcon size={15} />}
        </button>
        <img className="item-thumb" src={imgSrc(item.imageUrl)} alt="" />
        <div className="item-meta">
          <span className="item-title">{item.productName}</span>
          <span className="item-sub">
            {item.quantity} × {formatRand(price)}
            {cardPrice && useLoyalty && <span className="item-card"> · card price</span>}
            {cardPrice && !useLoyalty && (
              <span className="item-card"> · {formatRand(item.loyaltyPrice!)} with card</span>
            )}
          </span>
          <PriceStatus item={item} />
        </div>
        <span className="item-line-total">{formatRand(price * item.quantity)}</span>
      </div>
    </li>
  );
}

interface ItemSheetProps {
  item: ListItem;
  useLoyalty: boolean;
  closing: boolean;
  onClose: () => void;
  onQuantity: (quantity: number) => void;
  onDelete: () => void;
}

// An item's details (#113). Every change saves as it's made, so closing the
// sheet, however it's closed, keeps them.
function ItemSheet({ item, useLoyalty, closing, onClose, onQuantity, onDelete }: ItemSheetProps) {
  const price = linePrice(item, useLoyalty);
  return (
    <div className={`modal-backdrop${closing ? " modal-backdrop--closing" : ""}`} onClick={onClose}>
      <div className="modal item-sheet" role="dialog" aria-label={item.productName} onClick={(e) => e.stopPropagation()}>
        <div className="item-sheet-head">
          <img className="item-sheet-photo" src={imgSrc(item.imageUrl)} alt="" />
          <h3>{item.productName}</h3>
        </div>

        <dl className="item-sheet-prices">
          <div>
            <dt>Shelf price</dt>
            <dd className={useLoyalty && hasCardPrice(item) ? "item-sheet-struck" : undefined}>{formatRand(item.regularPrice)}</dd>
          </div>
          {item.loyaltyPrice !== null && (
            <div>
              <dt>Card price{useLoyalty ? "" : " (card off)"}</dt>
              <dd className="item-sheet-card">{formatRand(item.loyaltyPrice)}</dd>
            </div>
          )}
        </dl>
        <PriceStatus item={item} />

        <div className="item-sheet-qty">
          <span className="item-sheet-label">Quantity</span>
          <div className="stepper">
            <button aria-label="One fewer" disabled={item.quantity <= 1} onClick={() => onQuantity(item.quantity - 1)}>
              <MinusIcon />
            </button>
            <span className="stepper-value" aria-live="polite">{item.quantity}</span>
            <button aria-label="One more" onClick={() => onQuantity(item.quantity + 1)}>
              <PlusIcon />
            </button>
          </div>
        </div>

        <div className="item-sheet-total">
          <span className="item-sheet-label">Line total</span>
          <span className="item-sheet-amount">{formatRand(price * item.quantity)}</span>
        </div>

        <div className="item-sheet-actions">
          <button className="btn btn-danger-ghost" onClick={onDelete}>
            <TrashIcon />
            Delete
          </button>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
