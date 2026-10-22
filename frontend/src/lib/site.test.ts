import { describe, expect, it } from "vitest";
import { siteOf } from "./site";

describe("which copy of the app this is", () => {
  it("is live only at accucery.com itself", () => {
    expect(siteOf("accucery.com")).toBe("live");
    expect(siteOf("ACCUCERY.COM")).toBe("live");
  });

  it("is the test site at beta.accucery.com", () => {
    expect(siteOf("beta.accucery.com")).toBe("beta");
  });

  it("is neither anywhere else, so nothing there is counted or shows ads", () => {
    for (const host of ["www.accucery.com", "accucery.ethichadebe.me", "localhost", "127.0.0.1", "accucery.com.evil.example"]) {
      expect(siteOf(host), host).toBe("other");
    }
  });
});
