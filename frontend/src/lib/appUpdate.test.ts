import { describe, it, expect, vi } from "vitest";
import { checkForUpdate, shouldReload } from "./appUpdate";

const session = () => {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  return () => store;
};

describe("shouldReload", () => {
  it("reloads onto a different build", () => {
    expect(shouldReload("b1", "b2", null)).toBe(true);
  });

  it("stays on the current build", () => {
    expect(shouldReload("b1", "b1", null)).toBe(false);
  });

  it("ignores a missing or odd answer", () => {
    expect(shouldReload("b1", undefined, null)).toBe(false);
    expect(shouldReload("b1", "", null)).toBe(false);
    expect(shouldReload("b1", 42, null)).toBe(false);
  });

  it("tries each new build once, so a reload that doesn't land can't loop", () => {
    expect(shouldReload("b1", "b2", "b2")).toBe(false);
    expect(shouldReload("b1", "b3", "b2")).toBe(true);
  });
});

describe("checkForUpdate", () => {
  it("reloads once for a new build, then not again", async () => {
    const s = session();
    const reload = vi.fn();
    const deps = { current: "b1", fetchServedBuild: async () => "b2", session: s, reload };
    expect(await checkForUpdate(deps)).toBe(true);
    expect(await checkForUpdate(deps)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("carries on when the server can't be reached", async () => {
    const reload = vi.fn();
    const failing = async () => {
      throw new Error("offline");
    };
    expect(await checkForUpdate({ current: "b1", fetchServedBuild: failing, session: session(), reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("never reloads without somewhere to remember it did", async () => {
    const reload = vi.fn();
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(await checkForUpdate({ current: "b1", fetchServedBuild: async () => "b2", session: blocked, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
