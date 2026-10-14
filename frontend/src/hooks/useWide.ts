import { useSyncExternalStore } from "react";

// A tablet or PC (2026-10-14): wide enough to lay the app out across the
// screen instead of in a phone-width column. index.css uses the same width
// in its "Tablet and PC" section; keep the two in step.
export const WIDE_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}
