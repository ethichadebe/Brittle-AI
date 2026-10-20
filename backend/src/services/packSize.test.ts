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

  // 2026-10-19: Woolworths' "Eggs 18 pk" against Pick n Pay's "Eggs 18 Pack"
  // found nothing to compare, so offered nothing at all.
  it("reads a count as a size, compared per item", () => {
    expect(parsePackSize("Free Range Extra Large Chilled Eggs 18 pk")).toEqual({ quantity: 18, unit: "each" });
    expect(parsePackSize("PnP Live Well Free Range Extra Large Eggs 18 Pack")).toEqual({ quantity: 18, unit: "each" });
    expect(parsePackSize("Toilet Rolls 9 Packs")).toEqual({ quantity: 9, unit: "each" });
    expect(parsePackSize("Braai Skewers 6pcs")).toEqual({ quantity: 6, unit: "each" });
    expect(parsePackSize("Lemons 4 each")).toEqual({ quantity: 4, unit: "each" });
    expect(parsePackSize("Rusks Pack of 6")).toEqual({ quantity: 6, unit: "each" });
    expect(parsePackSize("Large Eggs 6's")).toEqual({ quantity: 6, unit: "each" });
  });

  // 2026-10-20: Checkers names what it sells by weight "Per KG", priced per kilogram.
  it("reads a price per kilogram as a 1 kg size", () => {
    expect(parsePackSize("Simple Truth Free-Range Fresh Whole Chicken Per KG")).toEqual({ quantity: 1000, unit: "g" });
    expect(parsePackSize("Beef Mince per kg")).toEqual({ quantity: 1000, unit: "g" });
    expect(parsePackSize("Bananas /kg")).toEqual({ quantity: 1000, unit: "g" });
    expect(parsePackSize("Lamb Chops Avg 1.2kg Per Kilogram")).toEqual({ quantity: 1000, unit: "g" });
    expect(parsePackSize("Kgotla Spice Supper 500g")).toEqual({ quantity: 500, unit: "g" });
  });

  it("prefers a weight or volume to a count, and never reads a bare number as one", () => {
    expect(parsePackSize("Yum Yum Smooth Peanut Butter 18 x 15g")).toEqual({ quantity: 270, unit: "g" });
    expect(parsePackSize("Large Eggs 18")).toBeNull();
    expect(parsePackSize("Free Range Chicken 4 Drumsticks & 4 Thighs")).toBeNull();
    expect(parsePackSize("Twin Pack")).toBeNull();
    expect(parsePackSize("0 Pack")).toBeNull();
  });

  it("takes the rightmost number, since a pack size trails the product name", () => {
    // "18" here is a pack count, not a size — the true size is the trailing 2L.
    expect(parsePackSize("Pack of 18 Coca-Cola Cans 2L")).toEqual({
      quantity: 2000,
      unit: "ml",
    });
  });
});
