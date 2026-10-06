// Google Analytics (decided with the owner, 2026-10-05): on for everyone,
// explained in the privacy notice. Read by the app and by the build, which
// opens the page's security policy (src/build/csp.ts) to Google only while
// this is set.
//
// The Measurement ID isn't a secret: every page that uses it shows it.
export const GA_MEASUREMENT_ID = "G-TK62VYR8WV";

export const GA_SCRIPT_ORIGIN = "https://www.googletagmanager.com";
/** Where gtag.js sends its hits. */
export const GA_COLLECT_ORIGINS = ["https://*.google-analytics.com", "https://*.analytics.google.com", GA_SCRIPT_ORIGIN];

export const isMeasurementId = (id: string) => /^G-[A-Z0-9]{4,}$/.test(id);
