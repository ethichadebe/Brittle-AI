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

  it("reach the image the frontend image is built from", () => {
    const dockerfile = readFileSync(join(REPO, "frontend", "Dockerfile"), "utf8");
    expect(dockerfile).toContain("COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf");
  });
});
