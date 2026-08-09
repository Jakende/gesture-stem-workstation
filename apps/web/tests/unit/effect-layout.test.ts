import { describe, expect, it } from "vitest";
import { mapHandToUpperLeftEffectRegion } from "../../src/visualization/effect-layout";

describe("mapHandToUpperLeftEffectRegion", () => {
  it("keeps the full hand range inside the upper-left screen region", () => {
    const corners = [
      mapHandToUpperLeftEffectRegion(0, 0),
      mapHandToUpperLeftEffectRegion(1, 0),
      mapHandToUpperLeftEffectRegion(0, 1),
      mapHandToUpperLeftEffectRegion(1, 1)
    ];

    for (const point of corners) {
      expect(point.normalizedX).toBeGreaterThanOrEqual(-0.88);
      expect(point.normalizedX).toBeLessThanOrEqual(-0.42);
      expect(point.normalizedY).toBeGreaterThanOrEqual(0.48);
      expect(point.normalizedY).toBeLessThanOrEqual(0.84);
    }
  });

  it("clamps noisy input before placing the emitter", () => {
    expect(mapHandToUpperLeftEffectRegion(-2, 4)).toEqual({ normalizedX: -0.88, normalizedY: 0.48 });
    const oppositeCorner = mapHandToUpperLeftEffectRegion(4, -2);
    expect(oppositeCorner.normalizedX).toBeCloseTo(-0.42);
    expect(oppositeCorner.normalizedY).toBeCloseTo(0.84);
  });
});
