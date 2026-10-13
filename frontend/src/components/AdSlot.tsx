import { useEffect, useState } from "react";
import { ADSENSE_CLIENT, type AdPlace } from "../adsConfig";
import { AD_SHAPES, fillSlot, slotFor } from "../lib/ads";
import { MAX_AD_SHARE, adShare, planFeedAds } from "../lib/adPlan";

// One ad, always labelled as one. Renders nothing at all until AdSense is
// set up for this place, so the page looks exactly as before until then.
// An ad Google leaves empty is hidden by CSS (data-ad-status="unfilled").
export function AdSlot({ place }: { place: AdPlace }) {
  const slot = slotFor(place);

  useEffect(() => {
    if (slot) fillSlot();
  }, [slot]);

  if (!slot) return null;
  const { width, height } = AD_SHAPES[place];
  return (
    <aside className={`ad ad--${place}`} aria-label="Advertisement">
      <span className="ad-label">Ad</span>
      <ins
        className="adsbygoogle"
        style={{ display: "inline-block", width, height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
      />
    </aside>
  );
}

/** Picked once per visit to a page, so its ads stay where they are. */
export function useAdSeed(): number {
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  return seed;
}

/**
 * Where a page's feed ads go and whether its banner shows, under the 30%
 * limit (lib/adPlan.ts). Heights are the page's own, measured in the
 * browser (PAGE_HEIGHTS in lib/ads.ts).
 */
export function usePageAds({
  banner,
  feed,
  count,
  itemHeight,
  otherContent,
  allowEnd = false,
}: {
  banner: AdPlace;
  feed: AdPlace;
  count: number;
  itemHeight: number;
  otherContent: number;
  allowEnd?: boolean;
}): { showBanner: boolean; feedSpots: Set<number> } {
  const seed = useAdSeed();
  const base = { count, seed, itemHeight, otherContent, adHeight: AD_SHAPES[feed].space, allowEnd };
  const bannerSpace = slotFor(banner) ? AD_SHAPES[banner].space : 0;
  // The banner first: if it alone would pass the limit, it doesn't show.
  const showBanner = bannerSpace > 0 && adShare({ ...base, otherAds: bannerSpace }, 0) <= MAX_AD_SHARE;
  const spots = slotFor(feed) ? planFeedAds({ ...base, otherAds: showBanner ? bannerSpace : 0, maxShare: MAX_AD_SHARE }) : [];
  return { showBanner, feedSpots: new Set(spots) };
}
