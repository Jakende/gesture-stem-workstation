import { describe, expect, it } from "vitest";
import { CLASSIC_HAND_MAPPINGS, mappingsForGestureMode, profileUsesIndividualFingers } from "../../src/gestures/gesture-control-profiles";

describe("gesture control profiles", () => {
  it("keeps classic control independent from individual finger features", () => {
    expect(CLASSIC_HAND_MAPPINGS.length).toBeGreaterThan(10);
    expect(profileUsesIndividualFingers(CLASSIC_HAND_MAPPINGS)).toBe(false);
    expect(CLASSIC_HAND_MAPPINGS.some((mapping) => mapping.source === "right.y" && mapping.target.parameter === "filter.cutoff")).toBe(true);
  });

  it("selects classic mappings without mutating the finger profile", () => {
    const fingerMappings = [{ ...CLASSIC_HAND_MAPPINGS[0]!, id: "finger-profile", source: "right.index.flexion" }];
    expect(mappingsForGestureMode("finger", fingerMappings)).toEqual(fingerMappings);
    expect(mappingsForGestureMode("classic", fingerMappings)).toEqual(CLASSIC_HAND_MAPPINGS);
  });

  it("keeps learned classic mappings isolated and lets them override classic defaults", () => {
    const learned = {
      ...CLASSIC_HAND_MAPPINGS[1]!,
      id: "classic-learned-cutoff",
      source: "right.x" as const
    };
    const projectMappings = [
      { ...CLASSIC_HAND_MAPPINGS[1]!, id: "finger-mapping" },
      learned
    ];

    expect(mappingsForGestureMode("finger", projectMappings)).toEqual([projectMappings[0]]);
    const classic = mappingsForGestureMode("classic", projectMappings);
    expect(classic.filter((mapping) => mapping.target.parameter === "filter.cutoff")).toEqual([learned]);
  });
});
