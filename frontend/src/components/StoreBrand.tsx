import type { CSSProperties } from "react";
import type { StoreConfig } from "@accucery/types";

// A store's own logo in place of its name (2026-10-03). The images are the
// stores' logos as the owner supplied them, trimmed, made transparent and
// scaled to 72px tall in public/stores/. In dark mode each sits on a small
// white tile, so dark logos (Woolworths, Pick n Pay) keep their real colours.
export function StoreLogo({ store, size = "sm" }: { store: StoreConfig; size?: "sm" | "md" }) {
  return (
    <span className={`store-logo store-logo--${size}`}>
      <img src={`/stores/${store.slug}.png`} alt={store.name} draggable={false} />
    </span>
  );
}

/**
 * The fill of a progress bar in the store's colours: its logo colour, or for
 * Makro three bands. The bands are laid across the whole track and revealed
 * as the fill grows, so a quarter-done Makro list is all blue and a finished
 * one shows all three.
 */
export function storeBarFill(store: StoreConfig | undefined, progress: number): CSSProperties {
  const width = `${progress * 100}%`;
  if (!store) return { width };
  const stripes = store.barStripes;
  if (!stripes?.length) {
    // A black bar would vanish on a dark track; the CSS swaps in a light one.
    return { width, background: `var(--bar-${store.slug}, ${store.color})` };
  }
  const band = 100 / stripes.length;
  const stops = stripes.map((c, i) => `${c} ${i * band}% ${(i + 1) * band}%`).join(", ");
  return {
    width,
    background: `linear-gradient(90deg, ${stops})`,
    // The gradient spans the track, not the fill: fill / progress = track.
    backgroundSize: progress > 0 ? `${100 / progress}% 100%` : undefined,
  };
}
