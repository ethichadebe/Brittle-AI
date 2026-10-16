import { describe, it, expect } from "vitest";
import { fitWithin, MAX_SIDE } from "./photo";

describe("shrinking a photo before it's sent", () => {
  it("brings the longest side down to the limit, keeping the shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_SIDE, height: 960 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 960, height: MAX_SIDE });
  });

  it("never enlarges a small one", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
