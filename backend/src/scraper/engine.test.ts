import { describe, it, expect, vi } from "vitest";
import type { Product } from "@accucery/types";
import { searchProducts } from "./engine.js";

const milk: Product = {
  productId: "p1",
  name: "Full Cream Milk 2L",
  imageUrl: "https://example.com/milk.jpg",
  regularPrice: 29.99,
  loyaltyPrice: 26.99,
};

vi.mock("./checkers.js", () => ({
  CheckersScraper: class {
    search = vi.fn();
  },
}));

describe("searchProducts (engine)", () => {
  it("returns empty array for unsupported store", async () => {
    const result = await searchProducts("woolworths", "milk");
    expect(result).toEqual([]);
  });

  it("returns normalised products from the scraper", async () => {
    const { CheckersScraper } = await import("./checkers.js");
    (CheckersScraper.prototype.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([milk]);

    const result = await searchProducts("checkers", "milk");
    expect(result).toEqual([milk]);
  });

  it("returns empty array and logs when scraper throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { CheckersScraper } = await import("./checkers.js");
    (CheckersScraper.prototype.search as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );

    const result = await searchProducts("checkers", "milk");
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[scraper:checkers]"),
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
