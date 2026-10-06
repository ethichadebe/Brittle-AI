import { describe, it, expect, vi, afterEach } from "vitest";
import { remember, type RememberedStore } from "./remember.js";

// #157: a default branch found by one run of the server is used by the next,
// so a deploy doesn't pay ScraperAPI to find it again.

const HOUR = 60 * 60 * 1000;
const TTL = 7 * 24 * HOUR;

function memoryStore<T>(start: { value: T; savedAt: Date } | null = null) {
  let kept = start;
  const store: RememberedStore<T> & { saves: T[] } = {
    saves: [],
    load: async () => kept,
    save: async (value) => {
      store.saves.push(value);
      kept = { value, savedAt: new Date() };
    },
  };
  return store;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("remembering across restarts", () => {
  it("uses what a previous run saved, without looking it up again", async () => {
    const lookUp = vi.fn().mockResolvedValue("found-again");
    const store = memoryStore({ value: "saved", savedAt: new Date(Date.now() - 2 * 24 * HOUR) });

    const r = remember("Shoprite", lookUp, "fallback", { ttlMs: TTL, failedTtlMs: HOUR, store });

    expect(await r.get()).toBe("saved");
    expect(await r.get()).toBe("saved");
    expect(lookUp).not.toHaveBeenCalled();
  });

  it("an answer saved more than a week ago is used at once, and refreshed behind it", async () => {
    let answer!: (v: string) => void;
    const lookUp = vi.fn(() => new Promise<string>((r) => (answer = r)));
    const store = memoryStore({ value: "old", savedAt: new Date(Date.now() - TTL - HOUR) });

    const r = remember("Shoprite", lookUp, "fallback", { ttlMs: TTL, failedTtlMs: HOUR, store });

    expect(await r.get()).toBe("old");
    expect(lookUp).toHaveBeenCalledTimes(1);
    answer("new");
    await vi.waitFor(async () => expect(await r.get()).toBe("new"));
    expect(store.saves).toEqual(["new"]);
    expect(lookUp).toHaveBeenCalledTimes(1);
  });

  it("with nothing saved, looks it up and saves it for the next run", async () => {
    const store = memoryStore<string>();
    const r = remember("Checkers", async () => "found", "fallback", { ttlMs: TTL, failedTtlMs: HOUR, store });

    expect(await r.get()).toBe("found");
    await vi.waitFor(() => expect(store.saves).toEqual(["found"]));
    // A second run reads it back.
    const next = remember("Checkers", vi.fn(), "fallback", { ttlMs: TTL, failedTtlMs: HOUR, store });
    expect(await next.get()).toBe("found");
  });

  it("a store it can't read is skipped, and the answer is looked up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store: RememberedStore<string> = { load: () => Promise.reject(new Error("db down")), save: async () => {} };
    const r = remember("Checkers", async () => "found", "fallback", { ttlMs: TTL, failedTtlMs: HOUR, store });
    expect(await r.get()).toBe("found");
  });

  it("a failed lookup isn't saved: the next run tries again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = memoryStore<string>();
    const r = remember("Checkers", () => Promise.reject(new Error("502")), "fallback", { ttlMs: TTL, failedTtlMs: HOUR, store });
    expect(await r.get()).toBe("fallback");
    expect(store.saves).toEqual([]);
  });
});
