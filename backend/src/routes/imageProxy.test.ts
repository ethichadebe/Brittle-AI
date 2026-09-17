import { describe, it, expect } from "vitest";
import { isAllowed, refererFor } from "./imageProxy.js";
import { STORE_CONFIGS } from "@accucery/types";

// A real image URL per live store, as returned by that store's scraper. When a
// fifth store is added, this list is what fails until its image host is allowed.
//
// Woolworths shipped with search working and every image broken, because its
// images live on assets.woolworthsstatic.co.za and only the four older hosts
// were on the allowlist. The proxy answered 400 and the UI showed a broken icon
// for every product — a store that looks delivered and is not.
const SAMPLES: Record<string, string> = {
  checkers: "https://www.checkers.co.za/medias/milk.jpg",
  shoprite: "https://www.shoprite.co.za/medias/bread.jpg",
  "pick-n-pay": "https://cdn-prd-02.pnp.co.za/sys-master/images/beans.jpg",
  woolworths: "https://assets.woolworthsstatic.co.za/Red-Kidney-Beans-400-g.jpg",
};

describe("image proxy allowlist", () => {
  it("covers every store that is switched on", () => {
    const live = STORE_CONFIGS.filter((s) => s.active).map((s) => s.slug);
    const uncovered = live.filter((slug) => !SAMPLES[slug] || !isAllowed(SAMPLES[slug]));
    expect(uncovered).toEqual([]);
  });

  it("fetches each store's images with its own referer", () => {
    expect(refererFor(SAMPLES.woolworths)).toBe("https://www.woolworths.co.za/");
    expect(refererFor(SAMPLES["pick-n-pay"])).toBe("https://www.pnp.co.za/");
    expect(refererFor(SAMPLES.checkers)).toBe("https://www.checkers.co.za/");
  });

  it("refuses anything not on the list", () => {
    expect(isAllowed("https://example.com/evil.jpg")).toBe(false);
    expect(refererFor("https://example.com/evil.jpg")).toBe("");
  });

  // The allowlist is a suffix match, so this is the attack it has to survive:
  // a host that merely ends with an allowed name rather than being one.
  it("is not fooled by a look-alike domain", () => {
    expect(isAllowed("https://woolworthsstatic.co.za.evil.com/x.jpg")).toBe(false);
    expect(isAllowed("https://notwoolworthsstatic.co.za/x.jpg")).toBe(false);
    expect(isAllowed("https://assets.woolworthsstatic.co.za/x.jpg")).toBe(true);
  });

  it("refuses a relative path, which has no host at all", () => {
    expect(isAllowed("/content/dam/milk.jpg")).toBe(false);
  });
});
