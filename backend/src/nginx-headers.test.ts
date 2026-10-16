import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #153. nginx drops the server's add_header lines from any location that has
// one of its own, so a header set only at the server level silently vanishes
// from exactly the pages that are cached (index.html, sw.js). Every location
// that adds a header must include the security snippet again.

const REPO = join(import.meta.dirname, "..", "..");
const conf = readFileSync(join(REPO, "nginx.conf"), "utf8");
const snippet = readFileSync(join(REPO, "nginx-security-headers.conf"), "utf8");
const INCLUDE = "include /etc/nginx/snippets/security-headers.conf;";

function locations(text: string): { head: string; body: string }[] {
  return [...text.matchAll(/^ {4}location ([^{]+)\{\n([\s\S]*?)^ {4}\}/gm)].map((m) => ({ head: m[1].trim(), body: m[2] }));
}

describe("security headers", () => {
  it("are included for the whole server", () => {
    const outsideLocations = conf.replace(/^ {4}location [^{]+\{[\s\S]*?^ {4}\}/gm, "");
    expect(outsideLocations).toContain(INCLUDE);
  });

  it("are included again in every location that adds a header of its own", () => {
    const withHeaders = locations(conf).filter((l) => l.body.includes("add_header"));
    expect(withHeaders.length).toBeGreaterThan(0);
    for (const l of withHeaders) expect(l.body, `location ${l.head}`).toContain(INCLUDE);
  });

  it("cover framing, sniffing, referrers, permissions and HTTPS", () => {
    for (const name of ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(snippet).toMatch(new RegExp(`add_header ${name} .+ always;`));
    }
    expect(snippet).toContain("frame-ancestors 'none'");
  });

  // Photo search's scanner (CameraScan.tsx) needs the camera; without it the
  // browser refuses and only "Choose a photo" works. This site only, and the
  // microphone never.
  it("let this site, and only this site, use the camera and location", () => {
    const policy = snippet.match(/add_header Permissions-Policy "([^"]+)"/)?.[1] ?? "";
    expect(policy).toContain("camera=(self)");
    expect(policy).toContain("geolocation=(self)");
    expect(policy).toContain("microphone=()");
  });

  it("reach the image the frontend image is built from", () => {
    const dockerfile = readFileSync(join(REPO, "frontend", "Dockerfile"), "utf8");
    expect(dockerfile).toContain("COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf");
  });
});

// Per-IP limits (rateLimit.ts) count on each proxy adding the address it got
// the request from; app.ts trusts exactly two of them in production.
describe("the visitor's address", () => {
  const XFF = /proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for;/;

  it("is passed on to the backend by the app's own nginx", () => {
    const api = locations(conf).find((l) => l.head === "/api/");
    expect(api?.body).toMatch(XFF);
  });

  it("is passed on by the host's nginx in the README's setup", () => {
    expect(readFileSync(join(REPO, "README.md"), "utf8")).toMatch(XFF);
  });
});

// A shared link's preview (frontend/index.html) needs full addresses. nginx
// fills in this site's own as it serves the page.
describe("the page's share card", () => {
  it("gets this site's address filled in wherever index.html is served", () => {
    const page = locations(conf).find((l) => l.head === "= /index.html");
    expect(page?.body).toContain("sub_filter         '__SITE_ORIGIN__' 'https://$host';");
    expect(page?.body).toContain("sub_filter_once    off;");
    // Every other page is index.html too, through this location.
    expect(locations(conf).find((l) => l.head === "/")?.body).toContain("try_files $uri $uri/ /index.html;");
    expect(readFileSync(join(REPO, "frontend", "index.html"), "utf8")).toContain("__SITE_ORIGIN__/og-image.jpg");
  });
});
