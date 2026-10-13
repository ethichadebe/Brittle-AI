import { describe, it, expect, beforeEach, vi } from "vitest";
import { fillSlot, slotFor, startAds, stopAds, AD_SHAPES } from "./ads";
import { AD_SLOTS, ADSENSE_CLIENT, adsTxt, isPublisherId } from "../adsConfig";

// An invented publisher id: the real one goes in adsConfig.ts.
const CLIENT = "ca-pub-1234567890123456";

function fakeWindow() {
  const added: { src: string; async: boolean; crossOrigin: string | null }[] = [];
  const w = {
    adsbygoogle: undefined as unknown[] | undefined,
    document: {
      createElement: () => ({ src: "", async: false, crossOrigin: null }) as unknown as HTMLScriptElement,
      head: { appendChild: (node: Node) => added.push(node as unknown as (typeof added)[number]) },
    },
  };
  return { w, added };
}

beforeEach(() => stopAds());

describe("loading AdSense", () => {
  it("does nothing until a publisher id is set", () => {
    const { w, added } = fakeWindow();
    expect(startAds("", w)).toBe(false);
    expect(startAds("ca-pub-123", w)).toBe(false);
    expect(added).toEqual([]);
  });

  it("loads Google's script once, for this publisher", () => {
    const { w, added } = fakeWindow();
    expect(startAds(CLIENT, w)).toBe(true);
    expect(startAds(CLIENT, w)).toBe(false);
    expect(added).toHaveLength(1);
    expect(added[0].src).toBe(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`);
    expect(added[0].async).toBe(true);
    expect(added[0].crossOrigin).toBe("anonymous");
  });

  it("is off in the code as it ships until the owner fills it in", () => {
    // Flips the day the real id goes in, as a reminder to check the privacy
    // notice and ads.txt went with it.
    expect(isPublisherId(ADSENSE_CLIENT)).toBe(false);
    expect(Object.values(AD_SLOTS).every((s) => s === "")).toBe(true);
  });
});

describe("which places show an ad", () => {
  const slots = { homeBanner: "1234567890", homeFeed: "", listBanner: "x", listFeed: "2345678901", compareWait: "" };

  it("none while AdSense isn't running", () => {
    expect(slotFor("homeBanner", slots)).toBeNull();
  });

  it("only those with a real slot id once it is", () => {
    const { w } = fakeWindow();
    startAds(CLIENT, w);
    expect(slotFor("homeBanner", slots)).toBe("1234567890");
    expect(slotFor("listFeed", slots)).toBe("2345678901");
    expect(slotFor("homeFeed", slots)).toBeNull();
    expect(slotFor("listBanner", slots)).toBeNull();
  });
});

describe("filling a slot", () => {
  it("asks AdSense, and never breaks the page if it throws", () => {
    const { w } = fakeWindow();
    fillSlot(w);
    expect(w.adsbygoogle).toHaveLength(1);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    w.adsbygoogle = { push: () => { throw new Error("All ins elements already have ads"); } } as unknown as unknown[];
    expect(() => fillSlot(w)).not.toThrow();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("the ads' boxes", () => {
  it("leave room for the label and margins around each ad", () => {
    for (const { height, space } of Object.values(AD_SHAPES)) expect(space).toBeGreaterThanOrEqual(height + 33);
  });

  it("fit a 360px phone", () => {
    for (const { width } of Object.values(AD_SHAPES)) expect(width).toBeLessThanOrEqual(328);
  });
});

describe("ads.txt", () => {
  it("names Google, the publisher without 'ca-', and Google's register id", () => {
    expect(adsTxt(CLIENT)).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });
});
