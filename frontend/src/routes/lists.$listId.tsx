import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import type { BranchLookup, GroceryList, ListItem, StoreSlug } from "@accucery/types";
import { api, imgSrc } from "../lib/api";
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
import { markHintSeen, nextHint, type Hint } from "../lib/onboarding";
import {
  currentPosition,
  LOCATABLE_STORES,
  locateList,
  LocationError,
  pendingLocate,
  rememberLocation,
  untilFound,
} from "../lib/location";
import {
  CheckIcon,
  ChevronIcon,
  MinusIcon,
  MoreIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SettingsIcon,
  SwapIcon,
  TrashIcon,
} from "../components/icons";
import { AddItems } from "../components/AddItems";
import { CompareFlow } from "../components/CompareFlow";
import { StoreLogo, storeBarFill } from "../components/StoreBrand";

// While any price on the list is being refreshed, ask again this often —
// one item takes a few seconds to scrape — and give up after this long, so
// a refresh that never reports back can't keep the page asking forever.
const PRICE_POLL_MS = 3000;
const PRICE_POLL_LIMIT_MS = 2 * 60 * 1000;

const hintStorage = () => window.localStorage;

const HINT_TEXT: Record<Hint, string> = {
  tick: "Tap the circle when it's in your trolley.",
  swipe: "Swipe an item left to delete it, or tap it for its details.",
};

function HintBubble({ hint, onDismiss }: { hint: Hint; onDismiss: () => void }) {
  return (
    <li className={`hint hint--${hint}`} role="note">
      <span className="hint-text">{HINT_TEXT[hint]}</span>
      <button className="hint-ok" onClick={onDismiss}>Got it</button>
    </li>
  );
}

const storeNameOf = (slug: StoreSlug | null) => STORE_CONFIGS.find((s) => s.slug === slug)?.name ?? "This store";

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
  // #131: the branch this list is priced at; null is Joburg (the default).
  const [branchName, setBranchName] = useState<string | null>(null);
  // #134: the store has no branch delivering near the shopper.
  const [outOfDelivery, setOutOfDelivery] = useState(false);
  // Already true when the New list screen started a lookup for this list.
  const [locating, setLocating] = useState(() => pendingLocate(listId) !== undefined);
  const [branchNote, setBranchNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // "5 items added", shown briefly after the add screen closes.
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const { account } = useAccountSession();
  const [comparing, setComparing] = useState(false);
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

  // Moving to a branch changes every price on the list, so they're
  // reloaded once it's saved. State is only set once the lookup answers.
  const finishLocate = (lookup: Promise<BranchLookup>) =>
    lookup
      .then(
        (found) => {
          if (found.branchName) {
            setBranchName(found.branchName);
            setOutOfDelivery(false);
            void reloadItems();
          } else if (found.outOfDelivery) {
            setOutOfDelivery(true);
            setBranchNote(`${storeNameOf(storeSlug)} doesn't deliver near you, so this list shows Joburg prices. In-store prices may differ.`);
          } else if (found.failed) {
            setBranchNote("Couldn't reach the store to find your branch. Try again in a moment.");
          } else if (found.finding) {
            setBranchNote("Still looking for your branch. Open the list again in a minute.");
          }
        },
        (e) =>
          setBranchNote(
            e instanceof LocationError
              ? e.problem === "denied"
                ? "Location is off for this site in your browser."
                : "Couldn't find your location. Try again in a moment."
              : "Couldn't reach the store to find your branch. Try again in a moment."
          )
      )
      .finally(() => setLocating(false));

  const settleLocate = (lookup: Promise<BranchLookup>) => {
    setLocating(true);
    setBranchNote(null);
    return finishLocate(lookup);
  };

  const locateHere = () =>
    settleLocate(
      currentPosition().then((where) => {
        rememberLocation(true);
        return locateList(listId, where);
      })
    );

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
      if (found) {
        setListName(found.name);
        setStoreSlug(found.storeSlug);
        setBranchName(found.branchName);
        setOutOfDelivery(found.outOfDelivery);
      }
    });
    // A lookup the New list screen started for this list - or, after a
    // reload, one still running on the server (#134).
    const lookup = pendingLocate(listId);
    if (lookup) void finishLocate(lookup);
    else
      api.lists
        .locateStatus(listId)
        .then((s) => {
          if (!s.finding) return;
          setLocating(true);
          void finishLocate(untilFound(listId, s));
        })
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finishLocate is rebuilt each render; listId is what it depends on
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

  // Ticking is optimistic: in a shop aisle a tick has to land at once, not
  // after a round trip. If the server refuses, the list is reloaded as it is.
  const patchItem = (item: ListItem, patch: Partial<Pick<ListItem, "quantity" | "isChecked">>) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    api.items.patch(listId, item.id, patch).catch((e) => {
      console.error("Failed to update item:", e);
      void reloadItems();
    });
  };

  // #117: one-time hints, one at a time. Doing what a hint teaches counts
  // as having seen it.
  const [hint, setHint] = useState<Hint | null>(() => nextHint(hintStorage));
  const dismissHint = (h: Hint) => {
    markHintSeen(hintStorage, h);
    setHint(nextHint(hintStorage));
  };

  const toggleCheck = (item: ListItem) => {
    if (hint === "tick") dismissHint("tick");
    patchItem(item, { isChecked: !item.isChecked });
  };

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
    if (hint === "swipe") dismissHint("swipe");
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
              <StoreLogo store={store} size="md" />
            </span>
          )}
          {storeSlug && LOCATABLE_STORES.includes(storeSlug) && (
            <span className="branch-line">
              <PinIcon />
              {locating ? (
                <span className="branch-finding">
                  Finding your nearest {store?.name ?? "branch"}…{storeSlug === "shoprite" && " This can take a minute."}
                </span>
              ) : branchName ? (
                <span className="branch-name">{branchName}</span>
              ) : outOfDelivery ? (
                <span className="branch-name">Joburg prices · no delivery near you</span>
              ) : (
                <>
                  <span>Joburg prices ·</span>
                  <button className="branch-use" onClick={() => void locateHere()}>Use my location</button>
                </>
              )}
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
          <i style={storeBarFill(store, progress)} />
        </div>
      </header>

      {branchNote && <p className="branch-note" role="status">{branchNote}</p>}

      {loaded && items.length === 0 && (
        <div className="list-empty">
          <p className="list-empty-title">Nothing on this list yet</p>
          <p>Tap <strong>Add</strong> to find products at {store?.name ?? "this store"}.</p>
        </div>
      )}

      <ul className="items">
        {toGet.map((item, i) => (
          <Fragment key={item.id}>
            {row(item)}
            {i === 0 && hint && <HintBubble hint={hint} onDismiss={() => dismissHint(hint)} />}
          </Fragment>
        ))}
      </ul>

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
        <button className="compare-btn" disabled={items.length === 0} onClick={() => setComparing(true)}>
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

      {comparing && storeSlug && (
        <CompareFlow
          listId={listId}
          storeSlug={storeSlug}
          items={items}
          signedIn={!!account}
          onSignIn={() => navigate({ to: "/sign-in", search: { then: `/lists/${listId}` } })}
          onClose={() => setComparing(false)}
        />
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
