import type { ListItem } from "@accucery/types";

export interface Summary {
  total: number;
  priceToPay: number;
  unchecked: number;
}

export function computeSummary(items: ListItem[], useLoyalty: boolean): Summary {
  const price = (item: ListItem) =>
    useLoyalty && item.loyaltyPrice !== null ? item.loyaltyPrice : item.regularPrice;

  const lineTotal = (item: ListItem) => price(item) * item.quantity;

  return {
    total: items.reduce((s, i) => s + lineTotal(i), 0),
    priceToPay: items.filter((i) => i.isChecked).reduce((s, i) => s + lineTotal(i), 0),
    unchecked: items.filter((i) => !i.isChecked).reduce((s, i) => s + lineTotal(i), 0),
  };
}
