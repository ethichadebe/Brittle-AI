import type { GroceryList } from "@accucery/types";

// Offered on the New list screen after the Shopper's own names (#111).
export const DEFAULT_LIST_NAMES = ["Weekly shop", "Monthly", "Month end", "Braai", "Top-up"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// What the name field starts with: "Shop 1 Oct". Dated so a new list is
// always sensibly named and tells itself apart from last week's on the home
// screen. Written out by hand so every phone shows the same thing whatever
// its language setting.
export function datedListName(date: Date): string {
  return `Shop ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// The chips: the names of the Shopper's lists, newest first, then the
// defaults, each name once however it was capitalised or spaced.
export function nameSuggestions(lists: GroceryList[], limit = 8): string[] {
  const newestFirst = [...lists].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of [...newestFirst.map((l) => l.name), ...DEFAULT_LIST_NAMES]) {
    const name = raw.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length === limit) break;
  }
  return names;
}
