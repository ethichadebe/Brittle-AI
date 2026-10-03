import { describe, it, expect } from "vitest";
import type { GroceryList } from "@accucery/types";
import { restoreList, withoutList } from "./listOrder";

const list = (id: string): GroceryList => ({
  id, storeSlug: "checkers", name: id, createdAt: "2026-10-01T00:00:00Z",
  itemCount: 0, checkedCount: 0, totalPrice: 0, branchName: null,
});
const ids = (lists: GroceryList[]) => lists.map((l) => l.id);

describe("removing a list and undoing it", () => {
  const all = [list("a"), list("b"), list("c")];

  it("removes the list and remembers where it was", () => {
    const { lists, index } = withoutList(all, "b");
    expect(ids(lists)).toEqual(["a", "c"]);
    expect(index).toBe(1);
  });

  it("puts it back in the same place", () => {
    const { lists, index } = withoutList(all, "b");
    expect(ids(restoreList(lists, all[1], index))).toEqual(["a", "b", "c"]);
  });

  it("puts it back at the end when the lists got shorter meanwhile", () => {
    expect(ids(restoreList([list("a")], list("c"), 2))).toEqual(["a", "c"]);
  });

  it("never shows a list twice", () => {
    expect(ids(restoreList(all, all[0], 2))).toEqual(["a", "b", "c"]);
  });

  it("leaves the lists alone when the id isn't there", () => {
    expect(withoutList(all, "z")).toEqual({ lists: all, index: -1 });
  });
});
