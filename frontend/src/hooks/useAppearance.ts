import { useState } from "react";
import { applyAppearance, readAppearance, saveAppearance, type Appearance } from "../lib/appearance";

const storage = () => window.localStorage;

export function useAppearance() {
  const [appearance, setState] = useState<Appearance>(() => readAppearance(storage));

  const setAppearance = (next: Appearance) => {
    saveAppearance(storage, next);
    applyAppearance(document.documentElement, next);
    setState(next);
  };

  return { appearance, setAppearance };
}
