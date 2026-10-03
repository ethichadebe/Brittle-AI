import { createHash } from "node:crypto";

// A store with no Price Zone ambiguity at all — Makro, verified; Pick n Pay,
// not yet investigated but showing none of the zone-carrying fields
// Woolworths has, so treated the same until shown otherwise.
export const NO_ZONE = "none";

// A store that has Price Zones, but no branch/cookie is configured for this
// scraper right now. Distinct from NO_ZONE: this store's prices genuinely
// vary by zone, we just don't know which one we're quoting.
export const UNCONFIGURED_ZONE = "unconfigured";

// Per ADR 0001, a Price Zone is identified by whatever the store itself
// calls it, opaque to us. For Checkers and Shoprite that identity is the set
// of store ids the site names for the branch (#66). Hashing keeps it a
// stable, opaque identifier (the same stores always yield the same zone id,
// different ones a different id) without storing the site's own ids.
export function opaqueZone(identity: string): string {
  const trimmed = identity.trim();
  if (!trimmed) return UNCONFIGURED_ZONE;
  return createHash("sha256").update(trimmed).digest("hex").slice(0, 12);
}
