import { randomBytes } from "node:crypto";

// Moving the app to a new address (#200). A Shopper without an Account is
// known only by a cookie (deviceId.ts), and a cookie belongs to the address
// it was set on: it can't follow them to a new one. So the old address hands
// it over, once, on their first visit:
//
//   old address  /api/handoff/send     makes a code for this browser's id
//   new address  /api/handoff/receive  swaps the code for that id, once
//
// Only the code is ever in an address, never the id. A code is single-use and
// expires in minutes, so one copied out of a browser's history is dead by the
// time anyone could use it. A browser that is signed in at the new address,
// or already has lists there, keeps its own identity: a handed-over one never
// replaces something.

export const HANDOFF_TTL_MS = 5 * 60 * 1000;
// Anyone can ask for a code, so the codes held are capped; past the cap, the
// visitor is sent on without one and starts fresh.
export const MAX_PENDING_HANDOFFS = 10_000;

const pending = new Map<string, { deviceId: string; expiresAt: number }>();

function prune(now: number): void {
  for (const [code, entry] of pending) if (entry.expiresAt <= now) pending.delete(code);
}

/** A single-use code for `deviceId`, or null when too many are outstanding. */
export function createHandoff(deviceId: string, now = Date.now()): string | null {
  if (pending.size >= MAX_PENDING_HANDOFFS) prune(now);
  if (pending.size >= MAX_PENDING_HANDOFFS) return null;
  const code = randomBytes(32).toString("base64url");
  pending.set(code, { deviceId, expiresAt: now + HANDOFF_TTL_MS });
  return code;
}

/** The device id a code stands for: once, and only before it expires. */
export function takeHandoff(code: unknown, now = Date.now()): string | null {
  if (typeof code !== "string") return null;
  const entry = pending.get(code);
  if (!entry) return null;
  pending.delete(code);
  return entry.expiresAt > now ? entry.deviceId : null;
}

/** Tests only. */
export function clearHandoffs(): void {
  pending.clear();
}

// Where to land after a handover: a page on this site, never another site.
// "//evil.example" and "/\evil.example" are read by browsers as other sites,
// so they, and anything else odd, land on the home page instead.
export function safePath(to: unknown): string {
  if (typeof to !== "string" || to.length > 2048) return "/";
  if (!to.startsWith("/") || to.startsWith("//")) return "/";
  for (const ch of to) {
    const c = ch.charCodeAt(0);
    if (ch === "\\" || c < 0x20 || c === 0x7f) return "/";
  }
  if (to === "/api" || to.startsWith("/api/")) return "/";
  return to;
}
