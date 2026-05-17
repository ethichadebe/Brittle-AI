import { useState } from "react";
import type { StoreSlug } from "@accucery/types";

const lsKey = (store: StoreSlug) => `loyalty:${store}`;

export function useLoyaltySettings() {
  const [flags, setFlags] = useState<Partial<Record<StoreSlug, boolean>>>(
    () => ({
      checkers: localStorage.getItem(lsKey("checkers")) === "true",
      "pick-n-pay": localStorage.getItem(lsKey("pick-n-pay")) === "true",
    })
  );

  const isEnabled = (store: StoreSlug): boolean => flags[store] ?? false;

  const toggle = (store: StoreSlug) => {
    const next = !isEnabled(store);
    localStorage.setItem(lsKey(store), String(next));
    setFlags((prev) => ({ ...prev, [store]: next }));
  };

  return { isEnabled, toggle };
}
