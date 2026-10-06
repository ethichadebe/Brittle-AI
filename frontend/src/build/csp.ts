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
}

export function contentSecurityPolicy(html: string, { analytics = false }: CspOptions = {}): string {
  const { scripts, styles } = inlineHashes(html);
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
