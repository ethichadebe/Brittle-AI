import { describe, it, expect } from "vitest";
import { APPEARANCE_KEY, applyAppearance, parseAppearance, readAppearance, saveAppearance } from "./appearance";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("appearance", () => {
  it("follows the phone unless light or dark was chosen", () => {
    expect(parseAppearance(null)).toBe("system");
    expect(parseAppearance("light")).toBe("light");
    expect(parseAppearance("dark")).toBe("dark");
    expect(parseAppearance("purple")).toBe("system");
  });

  it("survives a reload: what is saved is what is read back", () => {
    const store = memory();
    saveAppearance(() => store, "dark");
    expect(store.getItem(APPEARANCE_KEY)).toBe("dark");
    expect(readAppearance(() => store)).toBe("dark");
  });

  it("falls back to the phone when storage is unavailable", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(readAppearance(blocked)).toBe("system");
    expect(() => saveAppearance(blocked, "dark")).not.toThrow();
  });

  it("sets data-theme to override the phone, and clears it to follow it", () => {
    const root = { dataset: {} as DOMStringMap };
    applyAppearance(root, "light");
    expect(root.dataset.theme).toBe("light");
    applyAppearance(root, "system");
    expect(root.dataset.theme).toBeUndefined();
  });
});
