// First-time help (#117): the intro slides and the one-off hints. Each is
// remembered per device once seen. Storage can be missing or throw (private
// browsing); then nothing is remembered and nothing breaks.
type Store = () => Pick<Storage, "getItem" | "setItem">;

const INTRO_KEY = "accucery:introSeen";
const hintKey = (hint: Hint) => `accucery:hint:${hint}`;

// In the order they're shown on a list.
export const HINTS = ["tick", "swipe"] as const;
export type Hint = (typeof HINTS)[number];

function seen(storage: Store, key: string): boolean {
  try {
    return storage().getItem(key) === "true";
  } catch {
    // Can't remember, so don't keep showing it either.
    return true;
  }
}

function markSeen(storage: Store, key: string): void {
  try {
    storage().setItem(key, "true");
  } catch {
    // Not remembered; it may show again next visit.
  }
}

// The intro is for a first visit: never again once dismissed, and never for
// someone already using Accucery on this device (signed in, or with lists),
// who would otherwise meet it the day it ships.
export function shouldShowIntro(storage: Store, alreadyUsing: boolean): boolean {
  return !alreadyUsing && !seen(storage, INTRO_KEY);
}

export function markIntroSeen(storage: Store): void {
  markSeen(storage, INTRO_KEY);
}

// The next hint not yet seen on this device, or null when they all have been.
export function nextHint(storage: Store): Hint | null {
  return HINTS.find((h) => !seen(storage, hintKey(h))) ?? null;
}

export function markHintSeen(storage: Store, hint: Hint): void {
  markSeen(storage, hintKey(hint));
}
