import { describe, expect, it } from "vitest";

import { evenPositions, needsRebalance, positionBetween, positionForIndex } from "@/lib/ordering";

describe("positionBetween", () => {
  it("uses the midpoint between two neighbours", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });

  it("steps past the ends of a list", () => {
    expect(positionBetween(3000, undefined)).toBe(4000);
    expect(positionBetween(undefined, 1000)).toBe(0);
    expect(positionBetween(undefined, undefined)).toBe(1000);
  });

  it("keeps producing distinct, ordered positions when inserting repeatedly at the same spot", () => {
    let after = 2000;
    const before = 1000;
    for (let i = 0; i < 30; i++) {
      const next = positionBetween(before, after);
      expect(next).toBeGreaterThan(before);
      expect(next).toBeLessThan(after);
      after = next;
    }
  });
});

describe("needsRebalance", () => {
  it("flags neighbours that are too close to split again", () => {
    expect(needsRebalance(1000, 1000.0000001)).toBe(true);
    expect(needsRebalance(1000, 1001)).toBe(false);
    expect(needsRebalance(undefined, 1000)).toBe(false);
  });
});

describe("positionForIndex", () => {
  const items = [
    { id: "a", position: 1000 },
    { id: "b", position: 2000 },
    { id: "c", position: 3000 },
  ];

  it("places an item between the neighbours at the target index, ignoring its own old slot", () => {
    expect(positionForIndex(items, "c", 0).position).toBe(0);
    expect(positionForIndex(items, "a", 1).position).toBe(2500);
    expect(positionForIndex(items, "a", 2).position).toBe(4000);
  });

  it("clamps out-of-range indexes", () => {
    expect(positionForIndex(items, "a", 99).position).toBe(4000);
    expect(positionForIndex(items, "c", -5).position).toBe(0);
  });
});

describe("evenPositions", () => {
  it("spaces items 1000 apart", () => {
    expect(evenPositions(3)).toEqual([1000, 2000, 3000]);
  });
});
