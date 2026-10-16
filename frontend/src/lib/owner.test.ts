import { describe, it, expect } from "vitest";
import { ago, alertLabel, bytes, count, rands } from "./owner";
import { niceMax, shortDay } from "../components/DayColumns";

describe("the Owner's dashboard words and numbers", () => {
  it("names each open alert in plain words", () => {
    expect(alertLabel("store:checkers")).toBe("Checkers searches are failing");
    expect(alertLabel("credits")).toBe("ScraperAPI credits are running low");
    expect(alertLabel("disk")).toBe("The server's disk is filling up");
    expect(alertLabel("server-errors")).toBe("The app is answering with errors");
    expect(alertLabel("something-new")).toBe("something-new");
  });

  it("writes sizes, money and counts the way the app does", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(8_700_000)).toBe("8.3 MB");
    expect(bytes(150 * 1024 * 1024)).toBe("150 MB");
    expect(rands(42300)).toBe("R423.00");
    expect(rands(123456789)).toBe("R1 234 567.89");
    expect(count(1234567)).toBe("1 234 567");
  });

  it("says how long ago", () => {
    const now = Date.parse("2026-10-16T10:00:00Z");
    expect(ago("2026-10-16T09:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-16T09:55:00Z", now)).toBe("5 min ago");
    expect(ago("2026-10-16T07:00:00Z", now)).toBe("3 h ago");
    expect(ago("2026-10-15T08:00:00Z", now)).toBe("yesterday");
    expect(ago("2026-10-12T08:00:00Z", now)).toBe("4 days ago");
  });

  it("tops a chart's axis at a clean number", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(42)).toBe(50);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(2400)).toBe(2500);
  });

  it("names a day the South African way", () => {
    expect(shortDay("2026-10-16")).toMatch(/^16 Oct/);
  });
});
