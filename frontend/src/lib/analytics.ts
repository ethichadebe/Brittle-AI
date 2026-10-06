import type { StoreSlug } from "@accucery/types";
import { GA_MEASUREMENT_ID, GA_SCRIPT_ORIGIN, isMeasurementId } from "../analyticsConfig";

// What Google Analytics is told, and nothing else. Every address is cleaned
// first: list ids become ":id", and nothing after "?" or "#" is ever sent, so
// a confirm or reset link's token (#148, #149) can't reach Google. Events
// carry store names only: never product names, list names or emails.

type Gtag = (...args: unknown[]) => void;
let gtag: Gtag | null = null;

const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "/lists/3f2a…?x=1" -> "/lists/:id". */
export function cleanPath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0];
  const clean = path
    .split("/")
    .map((s) => (ID_SEGMENT.test(s) ? ":id" : s))
    .join("/")
    .replace(/\/+$/, "");
  return clean || "/";
}

interface AnalyticsWindow {
  dataLayer?: unknown[];
  location: { origin: string; pathname: string };
  document: { createElement(tag: "script"): HTMLScriptElement; head: { appendChild(node: Node): unknown } };
}

/** Loads gtag.js. Does nothing without a real Measurement ID. */
export function startAnalytics(id: string = GA_MEASUREMENT_ID, w: AnalyticsWindow = window as unknown as AnalyticsWindow): boolean {
  if (!isMeasurementId(id) || gtag) return false;
  const layer = (w.dataLayer = w.dataLayer ?? []);
  gtag = function () {
    // eslint-disable-next-line prefer-rest-params -- gtag.js reads only Arguments objects from dataLayer, not arrays
    layer.push(arguments);
  };
  gtag("js", new Date());
  gtag("config", id, {
    // Page views are sent by trackPage, with the cleaned address.
    send_page_view: false,
    page_location: w.location.origin + cleanPath(w.location.pathname),
    // Analytics only: nothing for Google's advertising.
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = w.document.createElement("script");
  script.async = true;
  script.src = `${GA_SCRIPT_ORIGIN}/gtag/js?id=${encodeURIComponent(id)}`;
  w.document.head.appendChild(script);
  origin = w.location.origin;
  return true;
}

let origin = "";
let currentPath = "/";

/** One screen viewed. */
export function trackPage(pathname: string): void {
  currentPath = cleanPath(pathname);
  gtag?.("event", "page_view", { page_location: origin + currentPath, page_path: currentPath, page_title: "Accucery" });
}

export type AnalyticsEvent = "list_created" | "item_added" | "compare_run" | "location_used" | "sign_up_confirmed";

/** One of the actions worth counting, with at most the stores involved. */
export function track(name: AnalyticsEvent, params: { store?: StoreSlug; target?: StoreSlug } = {}): void {
  const safe = { ...(params.store && { store: params.store }), ...(params.target && { target: params.target }) };
  gtag?.("event", name, { ...safe, page_location: origin + currentPath });
}

/** Tests only. */
export function resetAnalytics(): void {
  gtag = null;
  origin = "";
  currentPath = "/";
}
