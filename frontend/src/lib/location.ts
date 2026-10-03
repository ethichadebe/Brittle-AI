import type { BranchLookup, StoreSlug } from "@accucery/types";
import { api } from "./api";

// #131: pricing a list at the shopper's nearest branch.
//
// The shopper's position is read only when they ask for local prices, sent
// once to find the branch, and never kept: not in storage, not in state
// beyond the call that uses it. Only the branch is saved, on the list.

/** Stores whose lists can be priced at the nearest branch (mirrors the backend): Checkers (#131), Shoprite (#134), Pick n Pay (#135). */
export const LOCATABLE_STORES: readonly StoreSlug[] = ["checkers", "shoprite", "pick-n-pay"];

// Whether the shopper has said yes to local prices before. Later lists then
// use their location without asking again (the browser remembers its own
// permission); it's a preference, never a place.
const REMEMBER_KEY = "accucery:useLocation";

export function locationRemembered(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberLocation(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(REMEMBER_KEY, "1");
    else window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Private mode: it just asks again next time.
  }
}

export type LocationProblem = "denied" | "unavailable";

export class LocationError extends Error {
  constructor(readonly problem: LocationProblem) {
    super(problem === "denied" ? "Location is off for this site" : "Couldn't find your location");
  }
}

/** The device's position, after the browser's own permission prompt if needed. */
export function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new LocationError("unavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      (e) => reject(new LocationError(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable")),
      // A branch is kilometres wide: a rough, recent fix is plenty and fast.
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

// Lookups started by the New list screen, so the list it opens can show
// "Finding your nearest…" and the result, without the position ever being
// handed over. Keyed by list id, gone once settled.
const pending = new Map<string, Promise<BranchLookup>>();

// A Shoprite that delivers can take a minute to find (#134): the server
// answers "still finding" and is asked again this often, for this long.
export const POLL_MS = 3000;
const POLL_LIMIT_MS = 3 * 60 * 1000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ask again until the lookup is done, or give up and report it as still finding. */
export async function untilFound(listId: string, first: BranchLookup): Promise<BranchLookup> {
  let status = first;
  const since = Date.now();
  while (status.finding && Date.now() - since < POLL_LIMIT_MS) {
    await wait(POLL_MS);
    status = await api.lists.locateStatus(listId);
  }
  return status;
}

/** Find and save a list's nearest branch, however long it takes. */
export function locateList(listId: string, where: { latitude: number; longitude: number }): Promise<BranchLookup> {
  const lookup = api.lists.locate(listId, where).then((first) => untilFound(listId, first));
  pending.set(listId, lookup);
  void lookup.then(
    () => pending.delete(listId),
    () => pending.delete(listId)
  );
  return lookup;
}

export function pendingLocate(listId: string): Promise<BranchLookup> | undefined {
  return pending.get(listId);
}
