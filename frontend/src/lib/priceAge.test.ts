import { describe, it, expect } from "vitest";
import { priceAge } from "./priceAge";

const now = Date.parse("2026-10-01T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("priceAge", () => {
  it("says under an hour for a recent price", () => {
    expect(priceAge(ago(20 * 60 * 1000), now)).toBe("under an hour ago");
  });

  it("counts whole hours within a day", () => {
    expect(priceAge(ago(HOUR), now)).toBe("an hour ago");
    expect(priceAge(ago(5.5 * HOUR), now)).toBe("5 hours ago");
  });

  it("counts whole days after that", () => {
    expect(priceAge(ago(30 * HOUR), now)).toBe("yesterday");
    expect(priceAge(ago(3 * 24 * HOUR), now)).toBe("3 days ago");
  });

  it("never reports a negative age for a clock slightly ahead", () => {
    expect(priceAge(new Date(now + 5000).toISOString(), now)).toBe("under an hour ago");
  });
});
