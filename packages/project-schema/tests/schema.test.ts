import { createEmptyProject, deserializeProject, isProject, serializeProject } from "../src/index";
import { describe, expect, it } from "vitest";

describe("project schema", () => {
  it("creates versioned serializable state", () => {
    const project = createEmptyProject("Test");
    expect(isProject(JSON.parse(serializeProject(project)))).toBe(true);
  });

  it("does not persist ephemeral object URLs", () => {
    const project = createEmptyProject();
    project.assets.push({ id: "a", filename: "a.wav", mimeType: "audio/wav", objectUrl: "blob:test" });
    expect(serializeProject(project)).not.toContain("blob:test");
  });

  it("migrates version 1 audio and interaction defaults", () => {
    const migrated = deserializeProject(JSON.stringify({
      schemaVersion: 1,
      id: "old",
      name: "Old project",
      sampleRate: 48_000,
      assets: [],
      tracks: [{
        id: "track",
        name: "Bass",
        role: "bass",
        sourceAssetId: "asset",
        colorIndex: 1,
        audioState: { gain: 1, pan: 0, muted: false, solo: false, filterCutoff: 2000, filterResonance: 1 }
      }],
      mappings: [],
      scenes: [],
      loop: { enabled: false, startSeconds: 0, endSeconds: 10 }
    }));
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.automation).toEqual([]);
    expect(migrated.macros).toEqual([]);
    expect(migrated.tracks[0]?.audioState.bitDepth).toBe(16);
    expect(migrated.tracks[0]?.audioState.stutterEnabled).toBe(false);
    expect(migrated.tracks[0]?.audioState.highpassCutoff).toBe(20);
    expect(migrated.tracks[0]?.audioState.filterModRate).toBe(1.5);
    expect(migrated.tracks[0]?.audioState.reverseRate).toBe(1);
    expect(migrated.interaction.arrowKeyTrackSelectionEnabled).toBe(false);
  });

  it("migrates version 4 tracks to the finger-control audio defaults", () => {
    const migrated = deserializeProject(JSON.stringify({
      ...createEmptyProject("Version 4"),
      schemaVersion: 4,
      tracks: [{
        id: "track",
        name: "Stem",
        role: "other",
        sourceAssetId: "asset",
        colorIndex: 0,
        audioState: { gain: 0.7, reverseEnabled: true, stutterSeconds: 0.25 }
      }]
    }));
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.tracks[0]?.audioState.gain).toBe(0.7);
    expect(migrated.tracks[0]?.audioState.reverseRate).toBe(1);
    expect(migrated.tracks[0]?.audioState.filterModDepth).toBe(0);
  });
});
