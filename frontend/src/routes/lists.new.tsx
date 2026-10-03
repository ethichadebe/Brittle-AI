import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import type { GroceryList, StoreSlug } from "@accucery/types";
import { api } from "../lib/api";
import { datedListName, nameSuggestions } from "../lib/listNames";
import {
  currentPosition,
  LOCATABLE_STORES,
  locateList,
  LocationError,
  locationRemembered,
  rememberLocation,
} from "../lib/location";
import { CheckIcon, PinIcon } from "../components/icons";

export const Route = createFileRoute("/lists/new")({
  component: NewListPage,
});

const ACTIVE_STORES = STORE_CONFIGS.filter((s) => s.active);

// Creating a list (#111): a name, pre-filled and changeable from chips, and a
// Store. Two lists may share both (CONTEXT.md), so nothing here can collide.
function NewListPage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => datedListName(new Date()));
  const [store, setStore] = useState<StoreSlug | null>(null);
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // #131: local prices. On by default once the shopper has said yes before.
  const [useLocation, setUseLocation] = useState(locationRemembered);
  const [asking, setAsking] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const locatable = store !== null && LOCATABLE_STORES.includes(store);
  const storeName = STORE_CONFIGS.find((s) => s.slug === store)?.name ?? "store";

  // The browser's permission prompt only ever follows this tap, so it's
  // never a surprise. The position read here is thrown away: it only
  // proves permission. The list asks again, just as it's created.
  const toggleLocation = async () => {
    setLocationNote(null);
    if (useLocation) {
      setUseLocation(false);
      rememberLocation(false);
      return;
    }
    setAsking(true);
    try {
      await currentPosition();
      setUseLocation(true);
      rememberLocation(true);
    } catch (e) {
      rememberLocation(false);
      setLocationNote(
        e instanceof LocationError && e.problem === "denied"
          ? "Location is off for this site in your browser, so this list will use Joburg prices."
          : "Couldn't find your location, so this list will use Joburg prices."
      );
    } finally {
      setAsking(false);
    }
  };

  useEffect(() => {
    api.lists
      .list()
      .then((all) => {
        setLists(all);
        // The store of the newest list is the likeliest next one; with no
        // lists yet the Shopper picks, rather than Accucery guessing.
        setStore((picked) => picked ?? all[0]?.storeSlug ?? null);
      })
      // Chips are a convenience: without them the screen still works.
      .catch(console.error);
  }, []);

  const suggestions = nameSuggestions(lists);
  const ready = name.trim() !== "" && store !== null && !saving;

  const create = async () => {
    if (!ready || !store) return;
    setSaving(true);
    setError(null);
    try {
      const list = await api.lists.create(store, name.trim());
      // The branch is found in the background: the list opens straight
      // away on Joburg prices and moves to the branch when it's found.
      if (locatable && useLocation) {
        await currentPosition()
          .then((where) => void locateList(list.id, where).catch(console.error))
          .catch(console.error);
      }
      // Replace this screen, so back from the new list goes home, where it's
      // now at the top, not back to a form for a list that already exists.
      void navigate({ to: "/lists/$listId", params: { listId: list.id }, replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <div className="page-slide-in new-list">
      <header className="list-header">
        <button className="btn-back" aria-label="Back" onClick={() => navigate({ to: "/" })}>‹</button>
        <h2 className="list-title">New list</h2>
        <div style={{ width: 32 }} />
      </header>

      <form
        className="new-list-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label className="field-label" htmlFor="new-list-name">Name</label>
        <input
          id="new-list-name"
          className="new-list-name"
          value={name}
          maxLength={60}
          enterKeyHint="done"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="name-chips" role="group" aria-label="Name suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={name.trim().toLowerCase() === s.toLowerCase()}
              className={`name-chip${name.trim().toLowerCase() === s.toLowerCase() ? " name-chip--on" : ""}`}
              onClick={() => setName(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <span className="field-label" id="new-list-store">Store</span>
        <div className="store-tiles" role="radiogroup" aria-labelledby="new-list-store">
          {ACTIVE_STORES.map((s) => (
            <button
              key={s.slug}
              type="button"
              role="radio"
              aria-checked={store === s.slug}
              className={`store-tile${store === s.slug ? " store-tile--on" : ""}`}
              onClick={() => setStore(s.slug)}
            >
              <span className="store-tile-swatch" style={{ background: s.color }} />
              <span className="store-tile-name">{s.name}</span>
              {store === s.slug && <CheckIcon className="store-tile-check" />}
            </button>
          ))}
        </div>

        {locatable && (
          <div className="location-row">
            <span className="location-icon"><PinIcon /></span>
            <div className="location-text">
              <span className="location-title">Prices from your nearest {storeName}</span>
              <span className="location-sub">
                {useLocation
                  ? "Your location is used once to find the branch. Only the branch is saved."
                  : "Off: this list uses Joburg prices."}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useLocation}
              aria-label={`Prices from your nearest ${storeName}`}
              className={`toggle${useLocation ? " toggle--on" : ""}`}
              disabled={asking}
              onClick={() => void toggleLocation()}
            />
          </div>
        )}
        {locatable && locationNote && <p className="location-note" role="status">{locationNote}</p>}

        {error && <p className="form-error">{error}</p>}

        <div className="new-list-submit">
          {store === null && <p className="new-list-hint">Pick a store to shop at</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={!ready}>
            {saving ? "Creating…" : "Create list"}
          </button>
        </div>
      </form>
    </div>
  );
}
