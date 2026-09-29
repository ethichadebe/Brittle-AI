import { describe, it, expect } from "vitest";
import { parsePackSize } from "./packSize.js";

describe("parsePackSize", () => {
  // The three forms #89's acceptance criteria names explicitly.
  it("parses a plain mass: 500 g", () => {
    expect(parsePackSize("KOO Baked Beans in Tomato Sauce 500 g")).toEqual({
      quantity: 500,
      unit: "g",
    });
  });

  it("parses a plain volume: 2 L", () => {
    expect(parsePackSize("Clover Full Cream Milk 2 L")).toEqual({
      quantity: 2000,
      unit: "ml",
    });
  });

  it("parses a multiplier form: 6 x 1 L", () => {
    expect(parsePackSize("Long Life Full Cream Milk 6 x 1 L")).toEqual({
      quantity: 6000,
      unit: "ml",
    });
  });

  it("has no space requirement either side of the unit", () => {
    expect(parsePackSize("Coca-Cola Original 2L")).toEqual({ quantity: 2000, unit: "ml" });
    expect(parsePackSize("Jungle Oats 1kg")).toEqual({ quantity: 1000, unit: "g" });
  });

  it("is case-insensitive on both the unit and the multiplier sign", () => {
    expect(parsePackSize("Milk 2l")).toEqual({ quantity: 2000, unit: "ml" });
    expect(parsePackSize("Milk 6 X 1 l")).toEqual({ quantity: 6000, unit: "ml" });
    expect(parsePackSize("Milk 6 × 1 L")).toEqual({ quantity: 6000, unit: "ml" });
  });

  it("converts kg to the same base unit as g", () => {
    expect(parsePackSize("Rice 2kg")).toEqual({ quantity: 2000, unit: "g" });
  });

  it("converts ml directly, without scaling", () => {
    expect(parsePackSize("Shampoo 250ml")).toEqual({ quantity: 250, unit: "ml" });
  });

  // The refusal case #89 exists to protect: no size-shaped text anywhere.
  it("is unreadable rather than a guess when there is no size in the name", () => {
    expect(parsePackSize("Eggs Large 18s")).toBeNull();
    expect(parsePackSize("Fresh Chicken Breast Fillets")).toBeNull();
    expect(parsePackSize("")).toBeNull();
  });

  it("takes the rightmost number, since a pack size trails the product name", () => {
    // "18" here is a pack count, not a size — the true size is the trailing 2L.
    expect(parsePackSize("Pack of 18 Coca-Cola Cans 2L")).toEqual({
      quantity: 2000,
      unit: "ml",
    });
  });
});
