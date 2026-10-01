import { useState } from "react";

// A yes/no remembered on this device, e.g. whether "In trolley" is folded
// away (#112). Storage can be missing or throw (private browsing); then it's
// just not remembered.
export function useStoredFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : stored === "true";
    } catch {
      return initial;
    }
  });

  const set = (next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Still applies for this visit.
    }
  };

  return [value, set] as const;
}
