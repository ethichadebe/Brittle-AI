import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacyNotice } from "./PrivacyNotice";

// The notice tells the truth about ads whichever way AdSense is set
// (src/adsConfig.ts): it promises no ad cookies only while there are none,
// and names AdSense, personalisation and the way out once there are.
const text = (adsOn: boolean) =>
  renderToStaticMarkup(<PrivacyNotice adsOn={adsOn} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

describe("the privacy notice and ads", () => {
  it("while AdSense is off, promises no advertising cookies and names no ad service", () => {
    const off = text(false);
    expect(off).toContain("No advertising cookies.");
    expect(off).toContain("Nothing is sold, or used for advertising.");
    expect(off).not.toContain("AdSense");
  });

  it("once it's on, makes neither promise", () => {
    const on = text(true);
    expect(on).not.toContain("No advertising cookies");
    expect(on).not.toContain("Nothing is sold, or used for advertising.");
  });

  it("once it's on, names AdSense, says the ads are personalised, and how to turn that off", () => {
    const on = text(true);
    expect(on).toContain("Google AdSense");
    expect(on).toContain("The ads are personalised");
    expect(on).toContain("myadcenter.google.com");
    expect(on).toContain('each marked "Ad"');
    expect(on).toContain("We don't give it your email, your lists or what you search for.");
    // #172
    expect(on).toContain("With Premium, the app doesn't load AdSense at all.");
  });

  it("dates the change", () => {
    expect(text(false)).toContain("Last updated 3 October 2026");
    expect(text(true)).toContain("Last updated 15 October 2026");
  });

  it("still says Google Analytics isn't used for advertising, which stays true", () => {
    expect(text(true)).toContain("it isn't used for advertising");
  });
});
