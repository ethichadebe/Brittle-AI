// Light or dark (#110). "system" follows the phone; the other two override
// it on this device only, via data-theme on <html> (see index.css).
export type Appearance = "system" | "light" | "dark";

export const APPEARANCE_KEY = "accucery:appearance";

export function parseAppearance(value: string | null): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}

// Storage can be missing or throw (private browsing, blocked site data), and
// then the phone's setting is the right answer rather than a crash.
export function readAppearance(storage: () => Pick<Storage, "getItem">): Appearance {
  try {
    return parseAppearance(storage().getItem(APPEARANCE_KEY));
  } catch {
    return "system";
  }
}

export function saveAppearance(storage: () => Pick<Storage, "setItem">, appearance: Appearance): void {
  try {
    storage().setItem(APPEARANCE_KEY, appearance);
  } catch {
    // Still applied for this visit; it just won't survive a reload.
  }
}

export function applyAppearance(root: { dataset: DOMStringMap }, appearance: Appearance): void {
  if (appearance === "system") delete root.dataset.theme;
  else root.dataset.theme = appearance;
}
