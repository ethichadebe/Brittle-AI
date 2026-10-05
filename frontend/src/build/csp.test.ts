import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { contentSecurityPolicy, withCsp } from "./csp";

// #153: the page's policy names its inline splash script and style by
// fingerprint, so they run and nothing injected does.
const page = `<!doctype html><html><head>
<style>.splash{opacity:1}</style>
<script>window.splash = 1;</script>
<script type="module" src="/assets/index.js"></script>
</head><body></body></html>`;
const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

describe("the content security policy", () => {
  it("allows the page's own inline script and style by fingerprint, and nothing inline otherwise", () => {
    const policy = contentSecurityPolicy(page);
    expect(policy).toContain(`script-src 'self' ${sha("window.splash = 1;")}`);
    expect(policy).toContain(`style-src 'self' ${sha(".splash{opacity:1}")}`);
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("changes when the inline script does, so it can't go stale", () => {
    expect(contentSecurityPolicy(page)).not.toBe(contentSecurityPolicy(page.replace("splash = 1", "splash = 2")));
  });

  it("ignores scripts loaded from a file: 'self' covers those", () => {
    const { length } = contentSecurityPolicy(page).match(/sha256-/g) ?? [];
    expect(length).toBe(2);
  });

  it("goes first in <head>", () => {
    expect(withCsp(page)).toMatch(/<head>\s*<meta http-equiv="Content-Security-Policy" content="default-src 'self';/);
  });

  it("allows no plugins and no foreign forms or base URLs", () => {
    const policy = contentSecurityPolicy(page);
    for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'"]) expect(policy).toContain(d);
  });
});

describe("with Google Analytics on", () => {
  const html = "<html><head></head><body></body></html>";

  it("lets only Google's script and hits through, and nothing else new", () => {
    const off = contentSecurityPolicy(html);
    const on = contentSecurityPolicy(html, { analytics: true });
    expect(off).not.toContain("google");
    expect(on).toContain("script-src 'self' https://www.googletagmanager.com");
    expect(on).toMatch(/connect-src 'self' https:\/\/\*\.google-analytics\.com https:\/\/\*\.analytics\.google\.com https:\/\/www\.googletagmanager\.com/);
    // Still no inline script without a fingerprint, and no eval.
    expect(on).not.toContain("unsafe-inline");
    expect(on).not.toContain("unsafe-eval");
  });
});

