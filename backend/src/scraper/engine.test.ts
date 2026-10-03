import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Product, StoreSlug } from "@accucery/types";
import { searchProducts, createSearchEngine } from "./engine.js";
import type { Scraper } from "./types.js";

const milk: Product = {
  productId: "p1",
  name: "Full Cream Milk 2L",
  imageUrl: "https://example.com/milk.jpg",
  zone: "none",
  regularPrice: 29.99,
  loyaltyPrice: 26.99,
};

vi.mock("./shopriteGroup.js", () => {
  class CheckersScraper {}
  (CheckersScraper as any).prototype.search = vi.fn();
  class ShopriteScraper {}
  (ShopriteScraper as any).prototype.search = vi.fn();
  return { CheckersScraper, ShopriteScraper, normalise: vi.fn() };
});

vi.mock("./pnp.js", () => {
  class PnpScraper {}
  (PnpScraper as any).prototype.search = vi.fn();
  return { PnpScraper, normalise: vi.fn() };
});

vi.mock("./playwright.js", () => ({
  playwrightScraper: { search: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// The production registry's own wiring — which store's scraper actually
// gets called, and the Playwright fallback when it throws. #74 changed how
// this is *built* (a factory instead of a bare module-level object) but not
// this dispatch behaviour, so these still exercise the real, exported
// `searchProducts` against the store classes it actually constructs.
describe("searchProducts (engine)", () => {
  // This assertion has been repointed twice - at "woolworths" until Woolworths
  // got a scraper, then at "spar" until SPAR was removed - so it no longer names
  // a real store at all. The behaviour under test is "a slug the registry does
  // not know returns an empty list", and an invented slug tests exactly that
  // without going stale the next time a store is added.
  it("returns empty array for unsupported store", async () => {
    const result = await searchProducts("nonesuch" as StoreSlug, "milk");
    expect(result).toEqual([]);
  });

  it("returns normalised products from the Checkers scraper", async () => {
    const { CheckersScraper } = await import("./shopriteGroup.js");
    (CheckersScraper.prototype.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([milk]);

    const result = await searchProducts("checkers", "milk");
    expect(result).toEqual([milk]);
  });

  it("returns normalised products from the PnP scraper", async () => {
    const { PnpScraper } = await import("./pnp.js");
    (PnpScraper.prototype.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([milk]);

    const result = await searchProducts("pick-n-pay", "milk");
    expect(result).toEqual([milk]);
  });

  it("returns normalised products from the Shoprite scraper", async () => {
    const { ShopriteScraper } = await import("./shopriteGroup.js");
    (ShopriteScraper.prototype.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([milk]);

    const result = await searchProducts("shoprite", "milk");
    expect(result).toEqual([milk]);
  });

  it("falls back to Playwright when the Shoprite primary scraper throws", async () => {
    const { ShopriteScraper } = await import("./shopriteGroup.js");
    (ShopriteScraper.prototype.search as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("API blocked")
    );
    const { playwrightScraper } = await import("./playwright.js");
    (playwrightScraper.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([milk]);

    const result = await searchProducts("shoprite", "milk");
    expect(result).toEqual([milk]);
    expect(playwrightScraper.search).toHaveBeenCalledWith("shoprite", "milk");
  });

  it("falls back to Playwright when Checkers primary scraper throws", async () => {
    const { CheckersScraper } = await import("./shopriteGroup.js");
    (CheckersScraper.prototype.search as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("API blocked")
    );
    const { playwrightScraper } = await import("./playwright.js");
    (playwrightScraper.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([milk]);

    const result = await searchProducts("checkers", "milk");
    expect(result).toEqual([milk]);
    expect(playwrightScraper.search).toHaveBeenCalledWith("checkers", "milk");
  });

  it("falls back to Playwright when PnP primary scraper throws", async () => {
    const { PnpScraper } = await import("./pnp.js");
    (PnpScraper.prototype.search as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("API blocked")
    );
    const { playwrightScraper } = await import("./playwright.js");
    (playwrightScraper.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([milk]);

    const result = await searchProducts("pick-n-pay", "milk");
    expect(result).toEqual([milk]);
    expect(playwrightScraper.search).toHaveBeenCalledWith("pick-n-pay", "milk");
  });

  it("returns empty array and logs when primary scraper throws and Playwright is unavailable", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { CheckersScraper } = await import("./shopriteGroup.js");
    (CheckersScraper.prototype.search as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );
    const { playwrightScraper } = await import("./playwright.js");
    (playwrightScraper.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await searchProducts("checkers", "milk");
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[scraper:checkers]"),
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});

// A scraper a test controls completely: counts every call, and reports the
// highest number of calls that were ever in flight at once, so the
// per-store queue can be proven rather than assumed. `delayMs` gives a
// concurrent second call a real window to start before the first resolves.
class FakeScraper implements Scraper {
  calls = 0;
  private inFlight = 0;
  maxConcurrent = 0;

  constructor(private delayMs = 5, private zone = "none") {}

  currentZone(): string {
    return this.zone;
  }

  async search(): Promise<Product[]> {
    this.calls++;
    this.inFlight++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.inFlight--;
    return [];
  }
}

// #74: the substitution mechanism itself, and the per-store queue guarantee
// that depends on each engine owning its own queue rather than sharing one
// module-level map.
describe("createSearchEngine", () => {
  it("calls the substituted scraper for a store, with no network access", async () => {
    const fake = new FakeScraper();
    const engine = createSearchEngine({ checkers: fake });

    await engine.searchProducts("checkers", "milk");

    expect(fake.calls).toBe(1);
  });

  it("counts exactly how many times the fake was called", async () => {
    const fake = new FakeScraper();
    const engine = createSearchEngine({ checkers: fake });

    await engine.searchProducts("checkers", "milk");
    await engine.searchProducts("checkers", "bread");
    await engine.searchProducts("checkers", "eggs");

    expect(fake.calls).toBe(3);
  });

  it("returns an empty array for a store with no registered scraper", async () => {
    const engine = createSearchEngine({});
    expect(await engine.searchProducts("checkers", "milk")).toEqual([]);
  });

  // The queue is the point of this whole issue: three requests for the same
  // store fired without waiting for each other must still never run inside
  // the scraper at the same time.
  it("never runs two calls for the same store concurrently", async () => {
    const fake = new FakeScraper(10);
    const engine = createSearchEngine({ checkers: fake });

    await Promise.all([
      engine.searchProducts("checkers", "milk"),
      engine.searchProducts("checkers", "bread"),
      engine.searchProducts("checkers", "eggs"),
    ]);

    expect(fake.calls).toBe(3);
    expect(fake.maxConcurrent).toBe(1);
  });

  // Two different stores are two different queues — the point is
  // per-store serialisation, not a single global lock.
  it("runs calls for different stores concurrently, not queued behind each other", async () => {
    const checkers = new FakeScraper(20);
    const shoprite = new FakeScraper(20);
    const engine = createSearchEngine({ checkers, shoprite });

    const start = Date.now();
    await Promise.all([
      engine.searchProducts("checkers", "milk"),
      engine.searchProducts("shoprite", "milk"),
    ]);
    const elapsed = Date.now() - start;

    // Serial across both stores would take ~40ms; concurrent takes ~20ms.
    // A generous margin keeps this from being timing-flaky while still
    // failing if the two stores were wrongly sharing one queue.
    expect(elapsed).toBeLessThan(35);
  });

  it("a second engine instance never shares queue state with the first", async () => {
    const fakeA = new FakeScraper(15);
    const fakeB = new FakeScraper(15);
    const engineA = createSearchEngine({ checkers: fakeA });
    const engineB = createSearchEngine({ checkers: fakeB });

    const start = Date.now();
    await Promise.all([
      engineA.searchProducts("checkers", "milk"),
      engineB.searchProducts("checkers", "milk"),
    ]);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(30); // would be ~30ms if wrongly serialised together
  });
});

// #76 needs the current zone without scraping, to check the search cache
// before deciding whether to scrape at all.
describe("currentZone", () => {
  it("reads the registered scraper's own zone, without calling search", async () => {
    const fake = new FakeScraper(5, "p10");
    const engine = createSearchEngine({ checkers: fake });

    expect(await engine.currentZone("checkers")).toBe("p10");
    expect(fake.calls).toBe(0);
  });

  it("is NO_ZONE for a store with no registered scraper", async () => {
    const engine = createSearchEngine({});
    expect(await engine.currentZone("checkers")).toBe("none");
  });
});
