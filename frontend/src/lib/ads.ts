import { ADSENSE_CLIENT, ADS_SCRIPT_ORIGIN, AD_SLOTS, isPublisherId, isSlotId, type AdPlace } from "../adsConfig";

// Google AdSense, loaded once and only once its publisher id is set
// (src/adsConfig.ts). Each place shows an ad only once its own slot id is
// set too, so the script can go live for Google's site review before any ad
// unit exists.

interface AdsWindow {
  adsbygoogle?: unknown[];
  document: { createElement(tag: "script"): HTMLScriptElement; head: { appendChild(node: Node): unknown } };
}

let running = false;
// #172: a Premium account sees no ads, wherever it is in the app.
let adFree = false;

/** Loads adsbygoogle.js. Does nothing without a real publisher id. */
export function startAds(client: string = ADSENSE_CLIENT, w: AdsWindow = window as unknown as AdsWindow): boolean {
  if (!isPublisherId(client) || running) return false;
  w.adsbygoogle = w.adsbygoogle ?? [];
  const script = w.document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `${ADS_SCRIPT_ORIGIN}/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  w.document.head.appendChild(script);
  running = true;
  return true;
}

/**
 * #172: what the app runs at startup. A Premium account never loads
 * AdSense, so Google sets no ad cookies for it. When Premium can't be checked
 * (offline, or the server busy), no ads this visit: a paying shopper must
 * never see one, and a free one misses only a visit's ads.
 */
export async function startAdsUnlessPremium(
  isPremium: () => Promise<boolean>,
  client: string = ADSENSE_CLIENT,
  w: AdsWindow = window as unknown as AdsWindow
): Promise<boolean> {
  if (!isPublisherId(client)) return false;
  const premium = await isPremium().catch(() => true);
  if (premium) {
    adFree = true;
    return false;
  }
  return startAds(client, w);
}

/**
 * For Premium found mid-visit (signing in, or just subscribed): no ad shows
 * from here on. AdSense, if loaded already, can't be unloaded, but no slot
 * asks it for an ad, and the next visit doesn't load it at all.
 */
export function goAdFree(): void {
  adFree = true;
}

/** Tests only. */
export function stopAds(): void {
  running = false;
  adFree = false;
}

/** The slot id for a place, or null when that place shows nothing. */
export function slotFor(place: AdPlace, slots: Record<AdPlace, string> = AD_SLOTS): string | null {
  const slot = slots[place];
  return running && !adFree && isSlotId(slot) ? slot : null;
}

/** Asks AdSense to fill the newest empty slot. */
export function fillSlot(w: AdsWindow = window as unknown as AdsWindow): void {
  try {
    (w.adsbygoogle = w.adsbygoogle ?? []).push({});
  } catch (e) {
    // An ad that can't load must never break the page around it.
    console.error("AdSense:", e);
  }
}

/**
 * Each place's size. Fixed rather than responsive, so the page doesn't jump
 * when an ad arrives and the 30% limit (adPlan.ts) is measured, not guessed.
 * `space` is the whole box: the ad, its "Ad" label and its margins.
 */
export const AD_SHAPES: Record<AdPlace, { width: number; height: number; space: number }> = {
  homeBanner: { width: 320, height: 100, space: 136 },
  homeFeed: { width: 320, height: 100, space: 136 },
  listBanner: { width: 320, height: 50, space: 86 },
  listFeed: { width: 320, height: 100, space: 136 },
  compareWait: { width: 300, height: 250, space: 286 },
};

/**
 * The pages' own heights in px, measured on a phone-sized screen (390px
 * wide) on 2026-10-13, for the 30% limit. Rounded down, so the limit errs
 * towards fewer ads.
 */
export const PAGE_HEIGHTS = {
  /** One list card on the home screen, with the gap below it. */
  homeCard: 120,
  /** Everything on the home screen but the cards. */
  homeChrome: 165,
  /** The home screen with no lists yet. */
  homeEmpty: 537,
  /** One item row in a list. */
  listItem: 80,
  /** Everything in a list but the rows: its header and the space kept for the total bar. */
  listChrome: 248,
};
