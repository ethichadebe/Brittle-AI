import type { GroceryList } from "@accucery/types";

// Taking a list off the home screen remembers where it was, so UNDO can put
// it back in the same place rather than at the top or bottom (#110).
export function withoutList(lists: GroceryList[], id: string): { lists: GroceryList[]; index: number } {
  const index = lists.findIndex((l) => l.id === id);
  if (index === -1) return { lists, index };
  return { lists: [...lists.slice(0, index), ...lists.slice(index + 1)], index };
}

export function restoreList(lists: GroceryList[], list: GroceryList, index: number): GroceryList[] {
  if (lists.some((l) => l.id === list.id)) return lists;
  const at = Math.min(Math.max(index, 0), lists.length);
  return [...lists.slice(0, at), list, ...lists.slice(at)];
}
