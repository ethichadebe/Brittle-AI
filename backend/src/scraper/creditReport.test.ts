import { describe, it, expect } from "vitest";
import { formatReport } from "./creditReport.js";

describe("the credit report (#157)", () => {
  it("lists each day's spend by purpose, newest first, beside ScraperAPI's own count", () => {
    const report = formatReport(
      [
        { day: "2026-10-05", purpose: "search", count: 12 },
        { day: "2026-10-06", purpose: "search", count: 7 },
        { day: "2026-10-06", purpose: "branch", count: 2 },
      ],
      "2026-10-06",
      { requestCount: 140, requestLimit: 1000 }
    );
    expect(report).toBe(
      [
        "ScraperAPI credits spent by the app, newest first (the free 1,000 a month is about 33 a day):",
        "  2026-10-06 (today)    9  branch 2, search 7",
        "  2026-10-05   12  search 12",
        "ScraperAPI account: 140 of 1000 credits used this billing month",
      ].join("\n")
    );
  });

  it("says plainly when there's nothing yet, or ScraperAPI couldn't be asked", () => {
    expect(formatReport([], "2026-10-06", null)).toContain("nothing counted yet");
    expect(formatReport([], "2026-10-06", null)).toContain("no SCRAPERAPI_KEY set");
    expect(formatReport([], "2026-10-06", "403 Forbidden")).toContain("couldn't ask (403 Forbidden)");
  });
});
