import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { contentSecurityPolicy, forAds, withCsp } from "./csp";

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


describe("with AdSense on", () => {
  const built = `<!doctype html><html><head>
<style>.splash{opacity:1}</style>
<script>window.splash = 1;</script>
<script type="module" crossorigin src="/assets/index-abc.js"></script>
</head><body><div id="root"></div></body></html>`;
  const CLIENT = "ca-pub-1234567890123456";

  it("loads the app through a small inline script, and adds Google's verification tag", () => {
    const html = forAds(built, CLIENT);
    expect(html).not.toContain('<script type="module" crossorigin src=');
    expect(html).toContain('s.src="/assets/index-abc.js"');
    expect(html).toContain('s.type="module"');
    expect(html).toContain(`<meta name="google-adsense-account" content="${CLIENT}" />`);
  });

  it("waits for the page before starting the app, as the module tag did", () => {
    expect(forAds(built, CLIENT)).toContain('document.readyState==="loading"?document.addEventListener("DOMContentLoaded",l):l()');
  });

  it("fails the build rather than ship a page whose app won't load", () => {
    expect(() => forAds("<html><head></head></html>", CLIENT)).toThrow(/expected one module script/);
  });

  it("is the strict kind: scripts by fingerprint only, plus what they load", () => {
    const html = forAds(built, CLIENT);
    const policy = contentSecurityPolicy(html, { analytics: true, ads: true });
    const loader = html.match(/<script>(\(function\(\)\{function l[\s\S]*?)<\/script>/)?.[1] ?? "";
    expect(loader).not.toBe("");
    expect(policy).toContain(`script-src ${sha("window.splash = 1;")} ${sha(loader)} 'strict-dynamic'`);
    // No host is trusted to run scripts by name: that's what strict means.
    expect(policy).not.toMatch(/script-src[^;]*googletagmanager/);
    expect(policy).not.toContain("unsafe-eval");
    for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-src https:", "img-src 'self' data: blob: https:"]) {
      expect(policy).toContain(d);
    }
  });

  it("is the same policy as before while AdSense is off", () => {
    expect(contentSecurityPolicy(built, { analytics: true, ads: false })).toBe(contentSecurityPolicy(built, { analytics: true }));
    expect(contentSecurityPolicy(built, { analytics: true })).not.toContain("strict-dynamic");
  });
});
