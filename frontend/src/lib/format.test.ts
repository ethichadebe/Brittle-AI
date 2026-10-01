import { describe, it, expect } from "vitest";
import { formatRand, initials } from "./format";

describe("formatRand", () => {
  it("shows cents with a dot", () => {
    expect(formatRand(0)).toBe("R 0.00");
    expect(formatRand(34.9)).toBe("R 34.90");
  });

  it("separates thousands with a space", () => {
    expect(formatRand(1240.5)).toBe("R 1 240.50");
    expect(formatRand(999.99)).toBe("R 999.99");
    expect(formatRand(1234567.891)).toBe("R 1 234 567.89");
  });

  it("rounds to the cent before grouping", () => {
    expect(formatRand(999.999)).toBe("R 1 000.00");
  });
});

describe("initials", () => {
  it("takes the first letters of up to two name parts", () => {
    expect(initials("thandi.mokoena@example.com")).toBe("TM");
    expect(initials("sipho_dlamini_jr@example.com")).toBe("SD");
    expect(initials("thandi@example.com")).toBe("T");
  });

  it("skips parts that don't start with a letter", () => {
    expect(initials("2024.thandi@example.com")).toBe("T");
    expect(initials("123@example.com")).toBe("");
  });
});
