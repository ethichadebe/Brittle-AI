import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rateLimit.js";

// #152. A fake clock: every test says exactly when each attempt happens.
function at() {
  let now = 1_000_000;
  return { limiter: new RateLimiter(() => now), advance: (ms: number) => (now += ms) };
}

describe("a rate limit", () => {
  it("lets attempts through up to the limit, then says how long to wait", () => {
    const { limiter, advance } = at();
    const limit = [{ max: 3, windowMs: 60_000 }];
    expect(limiter.take("k", limit)).toBe(0);
    advance(10_000);
    expect(limiter.take("k", limit)).toBe(0);
    expect(limiter.take("k", limit)).toBe(0);
    // The oldest attempt ages out 50 s from now.
    expect(limiter.take("k", limit)).toBe(50_000);
  });

  it("doesn't count a refused attempt, so waiting is enough to get back in", () => {
    const { limiter, advance } = at();
    const limit = [{ max: 1, windowMs: 60_000 }];
    limiter.take("k", limit);
    for (let i = 0; i < 5; i++) limiter.take("k", limit);
    advance(60_000);
    expect(limiter.take("k", limit)).toBe(0);
  });

  it("applies every window: a short burst and a longer total", () => {
    const { limiter, advance } = at();
    const limits = [
      { max: 2, windowMs: 1_000 },
      { max: 3, windowMs: 60_000 },
    ];
    limiter.take("k", limits);
    limiter.take("k", limits);
    expect(limiter.take("k", limits)).toBeGreaterThan(0);
    advance(1_000);
    expect(limiter.take("k", limits)).toBe(0);
    advance(1_000);
    // The burst window is clear, but the minute's total is full.
    expect(limiter.take("k", limits)).toBeGreaterThan(1_000);
  });

  it("keeps keys apart", () => {
    const { limiter } = at();
    const limit = [{ max: 1, windowMs: 60_000 }];
    limiter.take("a", limit);
    expect(limiter.take("a", limit)).toBeGreaterThan(0);
    expect(limiter.take("b", limit)).toBe(0);
  });

  it("forgets keys with nothing recent", () => {
    const { limiter, advance } = at();
    const limit = [{ max: 1, windowMs: 60_000 }];
    limiter.take("k", limit);
    advance(3 * 60 * 60 * 1000);
    limiter.sweep();
    expect(limiter.take("k", limit)).toBe(0);
  });
});
