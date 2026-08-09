import { describe, expect, it } from "vitest";
import { encodeMidi } from "../src/index";

describe("encodeMidi", () => {
  it("writes a format-zero Standard MIDI File with note events", () => {
    const midi = encodeMidi([
      { pitch: 60, velocity: 100, startSeconds: 0, durationSeconds: 0.5 }
    ], 120);
    expect(new TextDecoder().decode(midi.slice(0, 4))).toBe("MThd");
    expect(new TextDecoder().decode(midi.slice(14, 18))).toBe("MTrk");
    expect([...midi]).toContain(0x90);
    expect([...midi]).toContain(0x80);
    expect([...midi].slice(-4)).toEqual([0, 0xff, 0x2f, 0]);
  });
});
