import { describe, it, expect } from "vitest";
import type { OwnerActivity } from "@accucery/types";
import { ago, alertLabel, bytes, count, filterActivity, rands, type ActivityFilter } from "./owner";
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

describe("filtering the Latest activity", () => {
  const at = "2026-10-16T10:00:00Z";
  const events: OwnerActivity[] = [
    { at, kind: "account", who: "thandi.m", text: "thandi.m created an account" },
    { at, kind: "list", who: "thandi.m", text: "thandi.m made a list at Checkers" },
    { at, kind: "list", text: "A list at Makro, without an account" },
    { at, kind: "signup", who: "sipho", text: "sipho signed up, waiting to confirm" },
    { at, kind: "checkout", who: "sipho", text: "sipho opened Premium checkout (monthly)" },
    { at, kind: "premium", who: "Lerato", text: "Lerato subscribed to Premium (yearly)" },
    { at, kind: "renewal", who: "thandi.m", text: "thandi.m renewed Premium (monthly)" },
  ];
  const texts = (kind: ActivityFilter, who = "") => filterActivity(events, kind, who).map((e) => e.text);

  it("shows everything for All", () => {
    expect(texts("all")).toHaveLength(events.length);
  });

  it("narrows to one kind, with Premium gathering checkouts, subscriptions and renewals", () => {
    expect(texts("list")).toEqual(["thandi.m made a list at Checkers", "A list at Makro, without an account"]);
    expect(texts("signup")).toEqual(["sipho signed up, waiting to confirm"]);
    expect(texts("premium")).toEqual([
      "sipho opened Premium checkout (monthly)",
      "Lerato subscribed to Premium (yearly)",
      "thandi.m renewed Premium (monthly)",
    ]);
  });

  it("narrows to a username, by any part of it and in any case, alone or with a kind", () => {
    expect(texts("all", "THANDI")).toEqual(["thandi.m created an account", "thandi.m made a list at Checkers", "thandi.m renewed Premium (monthly)"]);
    expect(texts("premium", "lera")).toEqual(["Lerato subscribed to Premium (yearly)"]);
    // A list without an account has no name, so a name never finds it.
    expect(texts("list", "a")).toEqual(["thandi.m made a list at Checkers"]);
    expect(texts("all", "nobody")).toEqual([]);
    expect(texts("all", "   ")).toHaveLength(events.length);
  });
});
