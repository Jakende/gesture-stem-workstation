export interface EffectRegionPosition {
  normalizedX: number;
  normalizedY: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const mapHandToUpperLeftEffectRegion = (rightX: number, rightY: number): EffectRegionPosition => ({
  normalizedX: -0.88 + clamp01(rightX) * 0.46,
  normalizedY: 0.84 - clamp01(rightY) * 0.36
});
