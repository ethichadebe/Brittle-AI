import { createHash } from "node:crypto";
import { GA_COLLECT_ORIGINS, GA_SCRIPT_ORIGIN } from "../analyticsConfig";

// The page's content security policy (#153), written into the built
// index.html. It allows the app's own files, and, by fingerprint only, the
// inline script and style of the opening animation, which are inline so the
// splash paints before anything loads. An injected script matches no
// fingerprint and doesn't run. Computed at build time from the HTML itself,
// so editing the animation can't leave a stale fingerprint behind.
//
// frame-ancestors can't be set from a <meta> tag; nginx sends it as a header
// (nginx-security-headers.conf).
//
// With AdSense on, the policy is the "strict" kind, the only kind Google
// supports for it, because the addresses its ads load from keep changing.
// Scripts are still allowed by fingerprint only, plus whatever a
// fingerprinted script loads ('strict-dynamic'): the app, gtag.js and
// adsbygoogle.js. What opens up is what ads are made of: frames, pictures
// and requests from any https address, and inline styles. The app's own
// <script src> can't be fingerprinted, so forAds() swaps it for a small
// inline script that loads it.

const sha256 = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/** The fingerprints of the page's inline <script> and <style> blocks. */
export function inlineHashes(html: string): { scripts: string[]; styles: string[] } {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => sha256(m[1]));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => sha256(m[1]));
  return { scripts, styles };
}

export interface CspOptions {
  /** Google Analytics is on: its script may load, and send its hits. */
  analytics?: boolean;
  /** AdSense is on: the strict policy, and ads' frames, pictures and styles. */
  ads?: boolean;
}

export function contentSecurityPolicy(html: string, { analytics = false, ads = false }: CspOptions = {}): string {
  const { scripts, styles } = inlineHashes(html);
  if (ads) {
    return [
      "default-src 'self'",
      // https: and 'unsafe-inline' are for browsers too old to know
      // 'strict-dynamic'; every current one ignores both once it sees it.
      ["script-src", ...scripts, "'strict-dynamic' https: 'unsafe-inline'"].join(" "),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-src https:",
      "manifest-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
  }
  const ga = (...sources: string[]) => (analytics ? sources : []);
  return [
    "default-src 'self'",
    ["script-src 'self'", ...scripts, ...ga(GA_SCRIPT_ORIGIN)].join(" "),
    `style-src 'self' ${styles.join(" ")}`.trim(),
    // Product pictures come through /api/image-proxy, so they're the site's own.
    ["img-src 'self' data: blob:", ...ga(...GA_COLLECT_ORIGINS)].join(" "),
    "font-src 'self' data:",
    ["connect-src 'self'", ...ga(...GA_COLLECT_ORIGINS)].join(" "),
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** The built page with its policy as the first thing in <head>. */
export function withCsp(html: string, options: CspOptions = {}): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(html, options)}" />`;
  return html.replace(/<head>/i, `<head>\n    ${meta}`);
}

/**
 * The built page made ready for AdSense: the app's own script loaded by a
 * small inline one (which the strict policy can fingerprint), and Google's
 * site-verification tag. Run before withCsp, so the loader is fingerprinted.
 */
export function forAds(html: string, client: string): string {
  const loaders = [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)];
  if (loaders.length !== 1) throw new Error(`forAds: expected one module script in the built page, found ${loaders.length}`);
  const src = loaders[0][1];
  // An added module script runs as soon as it loads, which can be before the
  // page below it is read, so it waits for the page as Vite's own tag did.
  const loader = `<script>(function(){function l(){var s=document.createElement("script");s.type="module";s.crossOrigin="";s.src=${JSON.stringify(src)};document.head.appendChild(s)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",l):l()})()</script>`;
  return html
    .replace(loaders[0][0], loader)
    .replace(/<head>/i, `<head>\n    <meta name="google-adsense-account" content="${client}" />`);
}
