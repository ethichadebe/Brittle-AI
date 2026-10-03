import { describe, it, expect } from "vitest";
import type { GroceryList } from "@accucery/types";
import { DEFAULT_LIST_NAMES, datedListName, nameSuggestions } from "./listNames";

const list = (name: string, createdAt: string): GroceryList => ({
  id: name, storeSlug: "checkers", name, createdAt, itemCount: 0, checkedCount: 0, totalPrice: 0, branchName: null, outOfDelivery: false,
});

describe("datedListName", () => {
  it("names a list after the day it was made", () => {
    expect(datedListName(new Date(2026, 9, 1))).toBe("Shop 1 Oct");
    expect(datedListName(new Date(2026, 11, 24))).toBe("Shop 24 Dec");
  });
});

describe("nameSuggestions", () => {
  it("offers only the defaults to a new Shopper", () => {
    expect(nameSuggestions([])).toEqual(DEFAULT_LIST_NAMES);
  });

  it("puts the Shopper's own names first, newest first", () => {
    const lists = [list("Nokubonga", "2026-09-01T00:00:00Z"), list("Party", "2026-09-20T00:00:00Z")];
    expect(nameSuggestions(lists).slice(0, 3)).toEqual(["Party", "Nokubonga", "Weekly shop"]);
  });

  it("never offers the same name twice", () => {
    const lists = [
      list("Braai", "2026-09-03T00:00:00Z"),
      list("braai ", "2026-09-02T00:00:00Z"),
      list("Weekly  shop", "2026-09-01T00:00:00Z"),
    ];
    const names = nameSuggestions(lists);
    expect(names.slice(0, 2)).toEqual(["Braai", "Weekly shop"]);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });

  it("stops at the limit", () => {
    const lists = Array.from({ length: 12 }, (_, i) => list(`List ${i}`, `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    expect(nameSuggestions(lists, 8)).toHaveLength(8);
  });
});
