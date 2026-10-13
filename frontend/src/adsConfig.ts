// Google AdSense (decided with the owner, 2026-10-13): personalised ads in
// five places, all off until these are filled in. Read by the app, which
// shows a slot only when its id is set, and by the build, which while the
// publisher id is set adds Google's verification tag, writes ads.txt and
// switches the page to the strict security policy AdSense needs
// (src/build/csp.ts).
//
// None of these is a secret: every page that shows an ad carries them.

/** "ca-pub-" and 16 digits, from AdSense → Account → Account information. */
export const ADSENSE_CLIENT: string = "ca-pub-4662593343882096";

/**
 * One ad unit per place, from AdSense → Ads → By ad unit. The id is the
 * data-ad-slot number in the unit's code. An empty one shows nothing there.
 */
export type AdPlace = "homeBanner" | "homeFeed" | "listBanner" | "listFeed" | "compareWait";

export const AD_SLOTS: Record<AdPlace, string> = {
  /** Home, under the New list button. */
  homeBanner: "",
  /** Home, among and under the lists. */
  homeFeed: "",
  /** Inside a list, above the total and Compare bar. */
  listBanner: "",
  /** Inside a list, between items. */
  listFeed: "",
  /** While a comparison runs, gone when its results show. */
  compareWait: "",
};

export const ADS_SCRIPT_ORIGIN = "https://pagead2.googlesyndication.com";

export const isPublisherId = (id: string) => /^ca-pub-\d{16}$/.test(id);
export const isSlotId = (id: string) => /^\d{6,}$/.test(id);

/**
 * The line ads.txt needs. f08c47fec0942fa0 is Google's own id in the IAB's
 * register, the same for every AdSense publisher.
 */
export const adsTxt = (client: string) => `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`;
