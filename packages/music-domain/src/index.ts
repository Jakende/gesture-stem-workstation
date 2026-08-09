export type AudioParameterId =
  | "gain"
  | "pan"
  | "filter.highpass"
  | "filter.cutoff"
  | "filter.resonance"
  | "delay.time"
  | "delay.feedback"
  | "delay.mix"
  | "reverb.mix";

export interface AudioParameterDescriptor {
  id: AudioParameterId;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  scale: "linear" | "log" | "exp";
  gestureMappable: boolean;
}

export const AUDIO_PARAMETERS: readonly AudioParameterDescriptor[] = [
  { id: "gain", label: "Gain", min: 0, max: 1.25, defaultValue: 0.82, scale: "linear", gestureMappable: true },
  { id: "pan", label: "Pan", min: -1, max: 1, defaultValue: 0, scale: "linear", gestureMappable: true },
  { id: "filter.highpass", label: "High-pass", min: 20, max: 8_000, defaultValue: 20, unit: "Hz", scale: "exp", gestureMappable: true },
  { id: "filter.cutoff", label: "Low-pass", min: 80, max: 20_000, defaultValue: 20_000, unit: "Hz", scale: "exp", gestureMappable: true },
  { id: "filter.resonance", label: "Resonance", min: 0.1, max: 18, defaultValue: 0.7, unit: "Q", scale: "exp", gestureMappable: true },
  { id: "delay.time", label: "Delay time", min: 0.02, max: 1.2, defaultValue: 0.24, unit: "s", scale: "linear", gestureMappable: true },
  { id: "delay.feedback", label: "Delay feedback", min: 0, max: 0.85, defaultValue: 0.28, scale: "linear", gestureMappable: true },
  { id: "delay.mix", label: "Delay mix", min: 0, max: 0.8, defaultValue: 0, scale: "linear", gestureMappable: true },
  { id: "reverb.mix", label: "Reverb mix", min: 0, max: 0.8, defaultValue: 0, scale: "linear", gestureMappable: true }
] as const;

export interface MidiNoteLike {
  pitch: number;
  velocity: number;
  startSeconds: number;
  durationSeconds: number;
}

const variableLength = (value: number): number[] => {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7) > 0) buffer = (buffer << 8) | ((value & 0x7f) | 0x80);
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8; else break;
  }
  return bytes;
};

const uint32 = (value: number): number[] => [value >>> 24, value >>> 16, value >>> 8, value].map((part) => part & 0xff);

export function encodeMidi(notes: readonly MidiNoteLike[], bpm = 120): Uint8Array {
  const ticksPerQuarter = 480;
  const ticksPerSecond = ticksPerQuarter * Math.max(1, bpm) / 60;
  const events = notes.flatMap((note) => {
    const start = Math.max(0, Math.round(note.startSeconds * ticksPerSecond));
    const end = Math.max(start + 1, Math.round((note.startSeconds + note.durationSeconds) * ticksPerSecond));
    const pitch = Math.max(0, Math.min(127, Math.round(note.pitch)));
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity)));
    return [
      { tick: start, order: 1, data: [0x90, pitch, velocity] },
      { tick: end, order: 0, data: [0x80, pitch, 0] }
    ];
  }).sort((a, b) => a.tick - b.tick || a.order - b.order);
  const microseconds = Math.round(60_000_000 / Math.max(1, bpm));
  const track: number[] = [0, 0xff, 0x51, 3, (microseconds >>> 16) & 0xff, (microseconds >>> 8) & 0xff, microseconds & 0xff];
  let previousTick = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - previousTick), ...event.data);
    previousTick = event.tick;
  }
  track.push(0, 0xff, 0x2f, 0);
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, ...uint32(6), 0, 0, 0, 1, ticksPerQuarter >>> 8, ticksPerQuarter & 0xff,
    0x4d, 0x54, 0x72, 0x6b, ...uint32(track.length), ...track
  ]);
}
