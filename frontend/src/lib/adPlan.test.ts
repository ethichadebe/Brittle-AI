import { describe, it, expect } from "vitest";
import { adShare, planFeedAds, seeded, type FeedPlanInput } from "./adPlan";

// A list page as measured (lib/ads.ts PAGE_HEIGHTS): 80px rows, 248px of
// header and total bar, 136px per feed ad, an 86px banner.
const list = (count: number, seed: number, over: Partial<FeedPlanInput> = {}): FeedPlanInput => ({
  count,
  seed,
  itemHeight: 80,
  adHeight: 136,
  otherContent: 248,
  otherAds: 86,
  ...over,
});

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);
const COUNTS = [0, 1, 2, 3, 4, 5, 8, 12, 20, 40, 80];

describe("where feed ads go", () => {
  it("never puts one at the very top: at least 3 items come first", () => {
    for (const seed of SEEDS) for (const count of COUNTS) {
      const spots = planFeedAds(list(count, seed));
      if (spots.length) expect(spots[0]).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps at least 4 items between two ads, so a tap meant for an item doesn't land on one", () => {
    for (const seed of SEEDS) {
      const spots = planFeedAds(list(80, seed));
      for (let i = 1; i < spots.length; i++) expect(spots[i] - spots[i - 1]).toBeGreaterThanOrEqual(4);
    }
  });

  it("only between items, never after the last one, unless that's allowed", () => {
    for (const seed of SEEDS) for (const count of COUNTS) {
      for (const at of planFeedAds(list(count, seed))) expect(at).toBeLessThan(count);
    }
  });

  it("never lets ads take more than 30% of the page, banner included", () => {
    for (const seed of SEEDS) for (const count of COUNTS) {
      const input = list(count, seed);
      expect(adShare(input, planFeedAds(input).length)).toBeLessThanOrEqual(0.3);
    }
  });

  it("drops ads from the bottom up when the page is short", () => {
    // A tight limit leaves room for one at most: it's the top one that stays.
    const input = list(40, 5);
    const all = planFeedAds({ ...input, maxShare: 1 });
    const few = planFeedAds({ ...input, maxShare: 0.2 });
    expect(few.length).toBeLessThan(all.length);
    expect(few).toEqual(all.slice(0, few.length));
  });

  it("is random between visits", () => {
    const firsts = new Set(SEEDS.map((seed) => planFeedAds(list(40, seed))[0]));
    expect(firsts.size).toBeGreaterThan(2);
  });

  it("stays put during a visit: the same seed gives the same spots", () => {
    expect(planFeedAds(list(30, 42))).toEqual(planFeedAds(list(30, 42)));
  });

  it("adding items only adds ads further down, never moves one", () => {
    for (const seed of SEEDS) {
      const before = planFeedAds(list(12, seed));
      const after = planFeedAds(list(30, seed));
      expect(after.slice(0, before.length)).toEqual(before);
    }
  });

  it("on the home screen, can go under the lists when there are only a few", () => {
    const home = { itemHeight: 120, adHeight: 136, otherContent: 165, otherAds: 0, allowEnd: true };
    expect(planFeedAds({ ...home, count: 2, seed: 1 })).toEqual([2]);
    // Without that, two lists are too few for one.
    expect(planFeedAds({ ...home, count: 2, seed: 1, allowEnd: false })).toEqual([]);
  });

  it("shows nothing in an empty feed", () => {
    expect(planFeedAds(list(0, 1))).toEqual([]);
  });
});

describe("the seeded random numbers", () => {
  it("repeat for a seed and stay between 0 and 1", () => {
    const a = seeded(9);
    const b = seeded(9);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
