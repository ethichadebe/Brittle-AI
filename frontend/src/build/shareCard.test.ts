import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// What a shared link shows (index.html). Every platform reads the same few
// tags; most want full addresses, which nginx fills in (nginx.conf).
const ROOT = join(import.meta.dirname, "..", "..");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const meta = (attr: "property" | "name", key: string) =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

describe("the share card", () => {
  it("has a title, description and picture for Open Graph (WhatsApp, Facebook, LinkedIn, Telegram...)", () => {
    for (const key of ["og:title", "og:description", "og:image", "og:url", "og:type", "og:site_name"]) {
      expect(meta("property", key), key).toBeTruthy();
    }
  });

  // 2026-10-21: what a search result shows under the name, at first.
  it("has a search description naming every store, short enough to show whole", () => {
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    for (const store of ["Checkers", "Pick n Pay", "Shoprite", "Woolworths", "Makro", "Clicks"]) {
      expect(description, store).toContain(store);
    }
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("asks X for the large picture card", () => {
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("name", "twitter:image")).toBe(meta("property", "og:image"));
  });

  it("gives every address in full, from this site's own (filled in by nginx)", () => {
    for (const key of ["og:url", "og:image", "og:image:secure_url"]) {
      expect(meta("property", key), key).toMatch(/^__SITE_ORIGIN__\//);
    }
  });

  it("says the picture's size, so the first share shows it without waiting", () => {
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    expect(meta("property", "og:image:type")).toBe("image/jpeg");
    expect(meta("property", "og:image:alt")).toBeTruthy();
  });

  it("points at a picture that's there, 1200 x 630, and small enough for WhatsApp", () => {
    const file = join(ROOT, "public", meta("property", "og:image")!.replace("__SITE_ORIGIN__/", ""));
    expect(statSync(file).size).toBeLessThan(300 * 1024);
    const jpg = readFileSync(file);
    expect(jpg.subarray(0, 2).toString("hex")).toBe("ffd8");
    // The size, from the JPEG's start-of-frame marker.
    let at = 2;
    while (at < jpg.length && !(jpg[at] === 0xff && jpg[at + 1] >= 0xc0 && jpg[at + 1] <= 0xc2)) at += 2 + jpg.readUInt16BE(at + 2);
    expect([jpg.readUInt16BE(at + 7), jpg.readUInt16BE(at + 5)]).toEqual([1200, 630]);
  });
});
