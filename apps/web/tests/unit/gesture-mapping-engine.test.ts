import type { GestureFrame } from "@gsw/gesture-domain";
import type { GestureMapping } from "@gsw/project-schema";
import { describe, expect, it } from "vitest";
import { GestureMappingEngine } from "../../src/gestures/gesture-mapping-engine";

const frame = (palmFacing: number): GestureFrame => ({
  timestamp: 0,
  handsVisible: ["right"],
  features: { "right.palmFacing": palmFacing }
});

describe("GestureMappingEngine toggle hysteresis", () => {
  it("switches once at each threshold and holds state between them", () => {
    const mapping: GestureMapping = {
      id: "reverse-gate",
      source: "right.palmFacing",
      target: {
        type: "selected-track-toggle",
        parameter: "reverse.enabled",
        gate: { onThreshold: 0.7, offThreshold: 0.35 }
      },
      transform: { inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1, curve: "linear", invert: false, smoothing: 0 },
      enabled: true
    };
    const engine = new GestureMappingEngine();
    engine.setMappings([mapping]);
    expect(engine.process(frame(0.8))[0]).toMatchObject({ gateState: true, gateChanged: true });
    expect(engine.process(frame(0.5))[0]).toMatchObject({ gateState: true, gateChanged: false });
    expect(engine.process(frame(0.2))[0]).toMatchObject({ gateState: false, gateChanged: true });
  });
});
