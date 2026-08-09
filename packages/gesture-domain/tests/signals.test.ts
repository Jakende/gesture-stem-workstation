import {
  ExponentialSmoother,
  TrackSelectionStabilizer,
  applyCurve,
  extractHandGestureFeatures,
  fingerFlexion,
  mapSignal,
  normalize
} from "../src/index";
import type { HandLandmark } from "../src/index";
import { describe, expect, it } from "vitest";

describe("gesture signal transforms", () => {
  it("normalizes and clamps", () => {
    expect(normalize(5, 0, 10)).toBe(0.5);
    expect(normalize(12, 0, 10)).toBe(1);
  });

  it("maps inverted exponential ranges", () => {
    expect(mapSignal(0, { inputMin: 0, inputMax: 1, outputMin: 100, outputMax: 1000, curve: "exp", invert: true, smoothing: 0 })).toBe(1000);
    expect(applyCurve(0.5, "s")).toBe(0.5);
  });

  it("smooths consecutive frames", () => {
    const smoother = new ExponentialSmoother(0.5);
    expect(smoother.next(0)).toBe(0);
    expect(smoother.next(1)).toBe(0.5);
  });

  it("holds a selected track while the hand jitters around its expanded zone", () => {
    const selector = new TrackSelectionStabilizer();
    selector.setSelected(1);
    expect(selector.next(0.51, 4, 0).selectedIndex).toBe(1);
    expect(selector.next(0.53, 4, 50).selectedIndex).toBe(1);
    expect(selector.next(0.49, 4, 100).changed).toBe(false);
  });

  it("requires a stable candidate before switching tracks", () => {
    const selector = new TrackSelectionStabilizer();
    selector.setSelected(0);
    expect(selector.next(0.7, 4, 0, 160).candidateIndex).toBe(2);
    expect(selector.next(0.7, 4, 100, 160).changed).toBe(false);
    const decision = selector.next(0.7, 4, 170, 160);
    expect(decision.changed).toBe(true);
    expect(decision.selectedIndex).toBe(2);
  });
});

describe("individual finger and palm features", () => {
  const hand = (): HandLandmark[] => Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

  it("distinguishes a straight finger from a flexed finger", () => {
    const straight = hand();
    straight[5] = { x: 0, y: 0, z: 0 };
    straight[6] = { x: 0, y: 1, z: 0 };
    straight[7] = { x: 0, y: 2, z: 0 };
    straight[8] = { x: 0, y: 3, z: 0 };
    const flexed = structuredClone(straight);
    flexed[7] = { x: 1, y: 1, z: 0 };
    flexed[8] = { x: 1, y: 0, z: 0 };
    expect(fingerFlexion(straight, "index")).toBeCloseTo(0);
    expect(fingerFlexion(flexed, "index")).toBeGreaterThan(0.45);
  });

  it("emits bounded flexion, rotation, palm-facing, and fingertip signals", () => {
    const landmarks = hand();
    landmarks[0] = { x: 0.5, y: 0.82, z: 0 };
    landmarks[5] = { x: 0.38, y: 0.56, z: -0.02 };
    landmarks[9] = { x: 0.5, y: 0.48, z: -0.04 };
    landmarks[17] = { x: 0.68, y: 0.58, z: 0.02 };
    for (const [base, tip] of [[5, 8], [9, 12], [13, 16], [17, 20]] as const) {
      for (let index = base + 1; index <= tip; index += 1) {
        landmarks[index] = { x: landmarks[base]?.x ?? 0.5, y: 0.56 - (index - base) * 0.08, z: -0.02 };
      }
    }
    landmarks[1] = { x: 0.45, y: 0.7, z: 0 };
    landmarks[2] = { x: 0.38, y: 0.64, z: 0 };
    landmarks[3] = { x: 0.32, y: 0.6, z: 0 };
    landmarks[4] = { x: 0.27, y: 0.56, z: 0 };
    const features = extractHandGestureFeatures(landmarks, "right", true);
    const unmirroredFeatures = extractHandGestureFeatures(landmarks, "right", false);
    for (const name of [
      "right.thumb.flexion",
      "right.index.flexion",
      "right.rotation.roll",
      "right.rotation.pitch",
      "right.rotation.yaw",
      "right.palmFacing",
      "right.index.tip.x"
    ] as const) {
      expect(features[name]).toBeGreaterThanOrEqual(0);
      expect(features[name]).toBeLessThanOrEqual(1);
    }
    expect(features["right.palmFacing"]).toBeCloseTo(unmirroredFeatures["right.palmFacing"] ?? -1);
  });
});
