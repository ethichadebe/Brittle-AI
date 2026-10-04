import type { FastifyReply } from "fastify";

// Limits on abuse and spend (#152). In memory: one backend process, and a
// restart forgetting a few counts is harmless.
//
// Each key keeps the times of its recent attempts. An attempt is refused,
// and not recorded, when any of its limits is already full; the caller is
// told how long until the oldest attempt in that window ages out.

export interface Limit {
  max: number;
  windowMs: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Generous for a person, tight for a script: a shopping session of a few
// dozen searches never comes near these.
export const LIMITS = {
  // Per email, so one account can't be guessed at from many devices, and per
  // device, so one device can't guess at many accounts.
  signInPerEmail: [{ max: 10, windowMs: 15 * MINUTE }],
  signInPerDevice: [{ max: 30, windowMs: 15 * MINUTE }],
  signUpPerDevice: [{ max: 5, windowMs: HOUR }],
  // Sign-up and reset both send email (#148, #149): one address can't be
  // flooded with them, and one device can't send them to everyone.
  emailsPerAddress: [{ max: 3, windowMs: HOUR }],
  resetsPerDevice: [{ max: 10, windowMs: HOUR }],
  // Each new Checkers or Shoprite search spends ScraperAPI credits (#146).
  searchPerDevice: [
    { max: 30, windowMs: MINUTE },
    { max: 300, windowMs: HOUR },
  ],
  // Finding a branch can take a dozen requests (#134).
  locatePerDevice: [{ max: 10, windowMs: HOUR }],
  // A comparison searches every item at another store.
  comparePerAccount: [{ max: 20, windowMs: HOUR }],
} satisfies Record<string, Limit[]>;

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Records an attempt and returns 0, or returns how many ms to wait. */
  take(key: string, limits: Limit[]): number {
    const now = this.now();
    const longest = Math.max(...limits.map((l) => l.windowMs));
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < longest);
    let wait = 0;
    for (const { max, windowMs } of limits) {
      const inWindow = recent.filter((t) => now - t < windowMs);
      if (inWindow.length >= max) wait = Math.max(wait, inWindow[0] + windowMs - now);
    }
    if (wait === 0) recent.push(now);
    this.hits.set(key, recent);
    return wait;
  }

  /** Forgets keys with nothing recent, so the map doesn't grow for ever. */
  sweep(olderThanMs: number = 2 * HOUR): void {
    const now = this.now();
    for (const [key, times] of this.hits) {
      if (!times.some((t) => now - t < olderThanMs)) this.hits.delete(key);
    }
  }

  /** Tests only. */
  clear(): void {
    this.hits.clear();
  }
}

export const limiter = new RateLimiter();
setInterval(() => limiter.sweep(), 10 * MINUTE).unref();

/** "Too many …" with Retry-After, in words a shopper can act on. */
export function tooMany(reply: FastifyReply, waitMs: number, what: string) {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  const when = seconds < 90 ? "in a minute" : `in ${Math.ceil(seconds / 60)} minutes`;
  return reply
    .header("Retry-After", String(seconds))
    .status(429)
    .send({ error: `Too many ${what}. Try again ${when}.` } as never);
}
