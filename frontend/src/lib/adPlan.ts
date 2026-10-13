// Where the ads go in a feed: the lists on the home screen, the items in a
// list (decided with the owner, 2026-10-13). Random, but:
//
//   - never at the very top, and never two close together, so ticking items
//     off doesn't land a tap on one by accident (AdSense counts those
//     against the account);
//   - ads never more than 30% of the page, the Better Ads Standards limit
//     on phones, past which Chrome may block every ad on the site;
//   - the same spots for as long as the page is open: the plan comes from a
//     seed picked once per visit, so ticking or adding an item never moves
//     an ad under a thumb. More items only add ads further down.

/** Better Ads Standards: ads no more than 30% of a page on a phone. */
export const MAX_AD_SHARE = 0.3;

export interface FeedPlanInput {
  /** Items in the feed. */
  count: number;
  /** Picked once per visit. */
  seed: number;
  /** Height of one item, in px. */
  itemHeight: number;
  /** Height of one feed ad, label and margins included, in px. */
  adHeight: number;
  /** The rest of the page's content (header, buttons, totals), in px. */
  otherContent: number;
  /** Ads on the page outside the feed (a banner), in px. */
  otherAds: number;
  /** Fewest items between two ads. */
  minGap?: number;
  /** Most items between two ads. */
  maxGap?: number;
  /** Fewest items above the first ad. */
  firstAfter?: number;
  /** An ad may follow the last item: "under the lists". */
  allowEnd?: boolean;
  /** Most of the page that may be ads. */
  maxShare?: number;
}

/** A small, fast seeded random generator: the same seed, the same numbers. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The share of the page that ads would take up. */
export function adShare(input: FeedPlanInput, feedAds: number): number {
  const ads = input.otherAds + feedAds * input.adHeight;
  const total = input.otherContent + input.count * input.itemHeight + ads;
  return total > 0 ? ads / total : 0;
}

/**
 * How many items sit above each feed ad, in order. [3, 8] means an ad after
 * the 3rd item and another after the 8th.
 */
export function planFeedAds(input: FeedPlanInput): number[] {
  const { count, seed, minGap = 4, maxGap = 7, firstAfter = 3, allowEnd = false, maxShare = MAX_AD_SHARE } = input;
  if (count <= 0) return [];
  const random = seeded(seed);
  const between = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));

  const spots: number[] = [];
  let at = between(firstAfter, Math.max(firstAfter, maxGap));
  if (at >= count && allowEnd) at = count;
  // Strictly between items, or after the last one where that's allowed.
  while (at < count || (allowEnd && at === count)) {
    spots.push(at);
    if (at === count) break;
    at += between(minGap, maxGap);
  }

  // The 30% limit decides last, from the bottom up.
  while (spots.length && adShare(input, spots.length) > maxShare) spots.pop();
  return spots;
}
