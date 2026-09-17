import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Product } from "@accucery/types";
import { searchProducts } from "./engine.js";

const milk: Product = {
  productId: "p1",
  name: "Full Cream Milk 2L",
  imageUrl: "https://example.com/milk.jpg",
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

describe("searchProducts (engine)", () => {
  // Was "woolworths" until Woolworths got a scraper. SPAR is declared in
  // STORE_CONFIGS and has none, so it is the live example of a store the
  // registry does not know.
  it("returns empty array for unsupported store", async () => {
    const result = await searchProducts("spar", "milk");
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
