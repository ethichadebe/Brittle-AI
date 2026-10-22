// Which copy of the app this is (2026-10-22). The same build runs on the live
// site and on the password-protected test site, beta.accucery.com, where
// every pull request lands first. Only the live site counts visits or shows
// ads, and the test site says so on every screen.

export const LIVE_HOST = "accucery.com";

export type Site = "live" | "beta" | "other";

export function siteOf(hostname: string): Site {
  const host = hostname.toLowerCase();
  if (host === LIVE_HOST) return "live";
  if (host === `beta.${LIVE_HOST}`) return "beta";
  return "other";
}
