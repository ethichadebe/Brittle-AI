import { describe, it, expect } from "vitest";
import { markHintSeen, markIntroSeen, nextHint, shouldShowIntro } from "./onboarding";

const memory = () => {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  return () => store;
};
const blocked = () => {
  throw new Error("SecurityError");
};

describe("intro slides", () => {
  it("show on a first visit, and never once dismissed", () => {
    const storage = memory();
    expect(shouldShowIntro(storage, false)).toBe(true);
    markIntroSeen(storage);
    expect(shouldShowIntro(storage, false)).toBe(false);
  });

  it("skip someone already using Accucery on this device", () => {
    expect(shouldShowIntro(memory(), true)).toBe(false);
  });

  it("don't show when they can't be remembered", () => {
    expect(shouldShowIntro(blocked, false)).toBe(false);
    expect(() => markIntroSeen(blocked)).not.toThrow();
  });
});

describe("hints", () => {
  it("show one at a time, each once", () => {
    const storage = memory();
    expect(nextHint(storage)).toBe("tick");
    markHintSeen(storage, "tick");
    expect(nextHint(storage)).toBe("swipe");
    markHintSeen(storage, "swipe");
    expect(nextHint(storage)).toBeNull();
  });

  it("a hint seen out of order isn't shown again", () => {
    const storage = memory();
    markHintSeen(storage, "swipe");
    expect(nextHint(storage)).toBe("tick");
    markHintSeen(storage, "tick");
    expect(nextHint(storage)).toBeNull();
  });

  it("don't show when they can't be remembered", () => {
    expect(nextHint(blocked)).toBeNull();
  });
});
