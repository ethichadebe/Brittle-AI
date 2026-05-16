import { describe, it, expect } from "vitest";
import { computeSummary } from "./summary";
import type { ListItem } from "@accucery/types";

const item = (overrides: Partial<ListItem> = {}): ListItem => ({
  id: "1",
  listId: "list-1",
  productId: "p1",
  productName: "Test Product",
  imageUrl: "",
  regularPrice: 10,
  loyaltyPrice: 8,
  quantity: 1,
  isChecked: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("computeSummary", () => {
  // H: total = regularPrice × quantity for all items (loyalty off)
  it("totals regular price × quantity across all items when loyalty is off", () => {
    const items = [
      item({ regularPrice: 10, quantity: 2 }),
      item({ id: "2", regularPrice: 20, quantity: 1 }),
    ];
    const result = computeSummary(items, false);
    expect(result.total).toBe(40); // 10×2 + 20×1
  });

  // I: priceToPay = checked items only
  it("price to pay covers only checked items", () => {
    const items = [
      item({ id: "1", regularPrice: 10, quantity: 1, isChecked: true }),
      item({ id: "2", regularPrice: 20, quantity: 1, isChecked: false }),
    ];
    const { priceToPay } = computeSummary(items, false);
    expect(priceToPay).toBe(10);
  });

  // J: unchecked = unchecked items only
  it("unchecked covers only unchecked items", () => {
    const items = [
      item({ id: "1", regularPrice: 10, quantity: 1, isChecked: true }),
      item({ id: "2", regularPrice: 20, quantity: 1, isChecked: false }),
    ];
    const { unchecked } = computeSummary(items, false);
    expect(unchecked).toBe(20);
  });

  // K: uses loyaltyPrice when loyalty is on and loyaltyPrice is not null
  it("uses loyalty price in all totals when loyalty is on", () => {
    const items = [
      item({ id: "1", regularPrice: 10, loyaltyPrice: 6, quantity: 2, isChecked: true }),
      item({ id: "2", regularPrice: 20, loyaltyPrice: 14, quantity: 1, isChecked: false }),
    ];
    const result = computeSummary(items, true);
    expect(result.total).toBe(26);      // 6×2 + 14×1
    expect(result.priceToPay).toBe(12); // 6×2
    expect(result.unchecked).toBe(14);  // 14×1
  });

  // L: falls back to regularPrice when loyaltyPrice is null even if loyalty is on
  it("falls back to regular price when loyalty price is null", () => {
    const items = [item({ regularPrice: 15, loyaltyPrice: null, quantity: 1 })];
    const { total } = computeSummary(items, true);
    expect(total).toBe(15);
  });
});
