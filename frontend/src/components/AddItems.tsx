import { useEffect, useRef, useState } from "react";
import type { ListItem, StoreSlug } from "@accucery/types";
import { api, ApiError, imgSrc } from "../lib/api";
import { formatRand } from "../lib/format";
import { CheckIcon, CloseIcon, PlusIcon } from "./icons";

// Long enough to swallow a burst of keystrokes, short enough not to feel laggy.
// The backend runs one scrape at a time per store, so a request per keystroke
// queues up behind itself: typing "banana" measured 18.6s against 2.9s for a
// single search.
const SEARCH_DEBOUNCE_MS = 350;
// How long "Added" shows on a row before it settles to ×.
const ADDED_FLASH_MS = 1200;

// What a row offers to add: a search result or a Recent product.
interface Addable {
  productId: string;
  name: string;
  imageUrl: string;
  regularPrice: number;
  loyaltyPrice: number | null;
}

// What one "+" did, so its × can undo exactly that: take the row back off,
// or, if the product was already on the list and "+" merged into it (#83),
// take the one it added back off the quantity.
interface Added {
  itemId: string;
  merged: boolean;
}

interface AddItemsProps {
  listId: string;
  storeSlug: StoreSlug;
  storeName: string;
  useLoyalty: boolean;
  items: ListItem[];
  onSaved: (item: ListItem) => void;
  onRemoved: (itemId: string) => void;
  onDone: (addedCount: number) => void;
}

// Adding items (#114): stays open while the Shopper adds several products.
// With nothing typed, it offers what they've had on lists at this store
// before; typing searches the store.
export function AddItems({ listId, storeSlug, storeName, useLoyalty, items, onSaved, onRemoved, onDone }: AddItemsProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Addable[]>([]);
  const [searching, setSearching] = useState(false);
  // Why a search came back empty, when it wasn't for want of products:
  // too many searches in a row (#152) says so, and when to try again.
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [recent, setRecent] = useState<Addable[] | null>(null);
  const [added, setAdded] = useState<Map<string, Added>>(new Map());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Per product: a tap while its last tap is still on its way is ignored, so
  // a burst of taps can't add it several times (#98) or race its own ×.
  // The ref answers at once, before React re-renders; the state draws it.
  const busy = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    api.recentProducts(storeSlug).then(setRecent).catch(() => setRecent([]));
  }, [storeSlug]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      api.search(storeSlug, query.trim(), controller.signal, listId)
        .then((products) => {
          if (controller.signal.aborted) return;
          setResults(products);
          setSearchNote(null);
        })
        .catch((e) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setSearchNote(e instanceof ApiError && e.status === 429 ? e.message : null);
        })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, storeSlug, listId]);

  const withBusy = async (productId: string, work: () => Promise<void>) => {
    if (busy.current.has(productId)) return;
    busy.current.add(productId);
    setBusyIds(new Set(busy.current));
    setError(null);
    try {
      await work();
    } catch (e) {
      console.error(e);
      setError("Couldn't update the list. Check your connection and try again.");
    } finally {
      busy.current.delete(productId);
      setBusyIds(new Set(busy.current));
    }
  };

  const add = (p: Addable) =>
    withBusy(p.productId, async () => {
      if (added.has(p.productId)) return;
      const merged = items.some((i) => i.productId === p.productId);
      // The server merges a product already on the list into its row (#83).
      const item = await api.items.add(listId, {
        productId: p.productId,
        productName: p.name,
        imageUrl: p.imageUrl,
        regularPrice: p.regularPrice,
        loyaltyPrice: p.loyaltyPrice,
      });
      onSaved(item);
      setAdded((prev) => new Map(prev).set(p.productId, { itemId: item.id, merged }));
      setFlashing((prev) => new Set(prev).add(p.productId));
      setTimeout(() => setFlashing((prev) => {
        const next = new Set(prev);
        next.delete(p.productId);
        return next;
      }), ADDED_FLASH_MS);
    });

  const takeBack = (p: Addable) =>
    withBusy(p.productId, async () => {
      const a = added.get(p.productId);
      if (!a) return;
      const current = items.find((i) => i.id === a.itemId);
      if (a.merged && current && current.quantity > 1) {
        const updated = await api.items.patch(listId, a.itemId, { quantity: current.quantity - 1 });
        onSaved(updated);
      } else {
        await api.items.delete(listId, a.itemId);
        onRemoved(a.itemId);
      }
      setAdded((prev) => {
        const next = new Map(prev);
        next.delete(p.productId);
        return next;
      });
    });

  const typed = query.trim() !== "";
  const shown = typed ? results : recent ?? [];

  return (
    <div className="add-screen" role="dialog" aria-label={`Add to your ${storeName} list`}>
      <header className="add-top">
        <input
          ref={inputRef}
          className="add-search"
          type="search"
          enterKeyHint="search"
          placeholder={`Search ${storeName}`}
          aria-label={`Search ${storeName}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="add-done" onClick={() => onDone(added.size)}>Done</button>
      </header>

      {error && <p className="add-error" role="alert">{error}</p>}

      {!typed && recent && recent.length > 0 && <h2 className="add-section">Recent at {storeName}</h2>}

      <ul className="add-results">
        {typed && searching && <li className="add-note">Searching…</li>}
        {typed && !searching && results.length === 0 && <li className="add-note">{searchNote ?? "No products found"}</li>}
        {!typed && recent?.length === 0 && (
          <li className="add-note">Type to search {storeName}. Products you add will show here next time, for quick re-adding.</li>
        )}
        {shown.map((p) => {
          const a = added.get(p.productId);
          const onList = items.find((i) => i.productId === p.productId);
          const price = useLoyalty && p.loyaltyPrice !== null ? p.loyaltyPrice : p.regularPrice;
          const isBusy = busyIds.has(p.productId);
          return (
            <li key={p.productId} className={`add-row${a ? " add-row--added" : ""}`}>
              <img className="item-thumb" src={imgSrc(p.imageUrl)} alt="" />
              <div className="item-meta">
                <span className="item-title">{p.name}</span>
                <span className="item-sub">
                  {formatRand(price)}
                  {p.loyaltyPrice !== null && p.loyaltyPrice < p.regularPrice && (
                    <span className="item-card"> · {useLoyalty ? "card price" : `${formatRand(p.loyaltyPrice)} with card`}</span>
                  )}
                  {onList && !a && <span className="add-on-list"> · {onList.quantity} on list</span>}
                </span>
              </div>
              {flashing.has(p.productId) && <span className="add-flash">Added</span>}
              {a ? (
                <button
                  className="add-toggle add-toggle--remove"
                  aria-label={`Take ${p.name} back off the list`}
                  disabled={isBusy}
                  onClick={() => takeBack(p)}
                >
                  {flashing.has(p.productId) ? <CheckIcon size={18} /> : <CloseIcon />}
                </button>
              ) : (
                <button
                  className="add-toggle"
                  aria-label={`Add ${p.name}`}
                  disabled={isBusy}
                  onClick={() => add(p)}
                >
                  <PlusIcon />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
