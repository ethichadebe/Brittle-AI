import { describe, it, expect } from "vitest";
import { fitWithin, MAX_SIDE, searchesFromLines } from "./photo";

describe("sizing a photo for reading", () => {
  it("brings the longest side down to the limit, keeping the shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_SIDE, height: 1500 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: MAX_SIDE });
  });

  it("never enlarges a small one", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

const sure = (...texts: string[]) => texts.map((text) => ({ text, confidence: 90 }));

describe("turning what a photo says into searches", () => {
  it("makes each line of a shopping list a search, without bullets, ticks, numbering or how many", () => {
    expect(
      searchesFromLines(sure("- Milk", "• bread", "☐ Eggs", "✓ rice", "1. Sugar", "2) tea bags", "2 x Coke", "3x apples", "bananas x6", "4 potatoes"))
    ).toEqual(["Milk", "bread", "Eggs", "rice", "Sugar", "tea bags", "Coke", "apples", "bananas", "potatoes"]);
  });

  it("leaves out the list's title", () => {
    expect(searchesFromLines(sure("Shopping list", "SHOPPING LIST:", "Groceries", "My grocery list", "To buy", "Milk", "Grocery bags"))).toEqual([
      "Milk",
      "Grocery bags",
    ]);
  });

  it("keeps a size, which helps find the right pack", () => {
    expect(searchesFromLines(sure("2L full cream milk", "Sunlight 750ml", "Rice 2kg"))).toEqual([
      "2L full cream milk",
      "Sunlight 750ml",
      "Rice 2kg",
    ]);
  });

  it("drops prices, and lines that are only numbers, dates or symbols", () => {
    expect(searchesFromLines(sure("Bread R18.99", "Milk 24,99", "R 45", "16/10/2026", "~=|/!", "12345", "ab"))).toEqual(["Bread", "Milk"]);
  });

  it("skips what the reader wasn't sure of, and says each thing once", () => {
    expect(
      searchesFromLines([
        { text: "Milk", confidence: 92 },
        { text: "Mllk wlth smudge", confidence: 30 },
        { text: "milk", confidence: 88 },
        { text: "Eggs", confidence: 80 },
      ])
    ).toEqual(["Milk", "Eggs"]);
  });

  it("stops at a dozen, and keeps each one short", () => {
    const many = searchesFromLines(sure(...Array.from({ length: 20 }, (_, i) => `item number ${"abcdefghijklmnopqrst"[i]}`)));
    expect(many).toHaveLength(12);
    expect(searchesFromLines(sure("word ".repeat(30)))[0].length).toBeLessThanOrEqual(60);
  });

  it("finds nothing in nothing", () => {
    expect(searchesFromLines([])).toEqual([]);
    expect(searchesFromLines(sure("", "   "))).toEqual([]);
  });
});
