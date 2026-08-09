export const CURRENT_SCHEMA_VERSION = 5 as const;

export type TrackRole = "vocals" | "bass" | "drums" | "melody" | "other" | "custom";

export interface AudioTrackState {
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  highpassCutoff: number;
  filterCutoff: number;
  filterResonance: number;
  filterModDepth: number;
  filterModRate: number;
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  reverbMix: number;
  saturation: number;
  bitDepth: number;
  tremoloDepth: number;
  tremoloRate: number;
  freezeFeedback: number;
  stutterEnabled: boolean;
  stutterSeconds: number;
  reverseEnabled: boolean;
  reverseRate: number;
}

export interface ProjectAsset {
  id: string;
  filename: string;
  mimeType: string;
  objectUrl?: string;
  sha256?: string;
}

export interface ProjectTrack {
  id: string;
  name: string;
  role: TrackRole;
  sourceAssetId: string;
  colorIndex: number;
  audioState: AudioTrackState;
  transcription?: TranscriptionReference;
  synth?: SynthTrackState;
}

export interface PitchBendPoint {
  timeOffsetSeconds: number;
  semitones: number;
}

export interface NoteEvent {
  id: string;
  pitch: number;
  velocity: number;
  startSeconds: number;
  durationSeconds: number;
  confidence?: number;
  pitchBends?: PitchBendPoint[];
}

export interface TranscriptionReference {
  source: "basic-pitch" | "imported";
  createdAt: string;
  confidenceThreshold: number;
  notes: NoteEvent[];
}

export interface SynthTrackState {
  enabled: boolean;
  mix: number;
  oscillator: "sine" | "triangle" | "sawtooth" | "square";
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterCutoff: number;
  lfoRate: number;
  lfoDepth: number;
}

export interface MappingTransform {
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
  curve: "linear" | "exp" | "log" | "s";
  invert: boolean;
  smoothing: number;
  deadZone?: number;
}

export type GestureContinuousParameter =
  | "filter.highpass"
  | "filter.cutoff"
  | "filter.resonance"
  | "filter.modDepth"
  | "filter.modRate"
  | "delay.time"
  | "delay.feedback"
  | "delay.mix"
  | "reverb.mix"
  | "resynthesis.mix"
  | "saturation"
  | "bitDepth"
  | "tremolo.depth"
  | "tremolo.rate"
  | "freeze.feedback"
  | "stutter.seconds"
  | "reverse.rate"
  | "gain"
  | "pan";

export type GestureToggleParameter = "stutter.enabled" | "reverse.enabled";

export type GestureMappingTarget =
  | { type: "selected-track-parameter"; parameter: GestureContinuousParameter }
  | {
    type: "selected-track-toggle";
    parameter: GestureToggleParameter;
    gate: { onThreshold: number; offThreshold: number };
  }
  | { type: "track-selection"; parameter: "track.index" };

export interface GestureMapping {
  id: string;
  source: string;
  target: GestureMappingTarget;
  transform: MappingTransform;
  enabled: boolean;
}

export interface LoopRegion {
  enabled: boolean;
  startSeconds: number;
  endSeconds: number;
}

export interface InteractionSettings {
  arrowKeyTrackSelectionEnabled: boolean;
  trackSelectionDwellMs: number;
  trackSelectionHysteresis: number;
}

export interface AutomationPoint {
  timeSeconds: number;
  value: number;
}

export interface AutomationLane {
  id: string;
  mappingId: string;
  points: AutomationPoint[];
}

export interface SceneTrackState {
  trackId: string;
  audioState: AudioTrackState;
  synth?: SynthTrackState;
}

export interface Scene {
  id: string;
  name: string;
  tracks: SceneTrackState[];
}

export interface MappingMacroTarget {
  mappingId: string;
  weight: number;
}

export interface MappingMacro {
  id: string;
  name: string;
  source: string;
  targets: MappingMacroTarget[];
}

export interface MidiRouting {
  enabled: boolean;
  outputId?: string;
  channel: number;
}

export interface Project {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  name: string;
  sampleRate: number;
  tempo?: number;
  musicalKey?: string;
  assets: ProjectAsset[];
  tracks: ProjectTrack[];
  mappings: GestureMapping[];
  macros: MappingMacro[];
  scenes: Scene[];
  automation: AutomationLane[];
  midi: MidiRouting;
  loop: LoopRegion;
  interaction: InteractionSettings;
  selectedTrackId?: string;
  activeSceneId?: string;
}

export const defaultAudioTrackState = (): AudioTrackState => ({
  gain: 0.82,
  pan: 0,
  muted: false,
  solo: false,
  highpassCutoff: 20,
  filterCutoff: 20_000,
  filterResonance: 0.7,
  filterModDepth: 0,
  filterModRate: 1.5,
  delayTime: 0.24,
  delayFeedback: 0.28,
  delayMix: 0,
  reverbMix: 0,
  saturation: 0,
  bitDepth: 16,
  tremoloDepth: 0,
  tremoloRate: 4,
  freezeFeedback: 0,
  stutterEnabled: false,
  stutterSeconds: 0.125,
  reverseEnabled: false,
  reverseRate: 1
});

export const defaultSynthTrackState = (): SynthTrackState => ({
  enabled: false,
  mix: 0,
  oscillator: "triangle",
  attack: 0.015,
  decay: 0.12,
  sustain: 0.68,
  release: 0.18,
  filterCutoff: 8_000,
  lfoRate: 0,
  lfoDepth: 0
});

export const createEmptyProject = (name = "Untitled performance"): Project => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: crypto.randomUUID(),
  name,
  sampleRate: 48_000,
  assets: [],
  tracks: [],
  mappings: [],
  macros: [],
  scenes: [],
  automation: [],
  midi: { enabled: false, channel: 1 },
  loop: { enabled: false, startSeconds: 0, endSeconds: 16 },
  interaction: {
    arrowKeyTrackSelectionEnabled: false,
    trackSelectionDwellMs: 160,
    trackSelectionHysteresis: 0.14
  }
});

export function isProject(value: unknown): value is Project {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Project>;
  return candidate.schemaVersion === CURRENT_SCHEMA_VERSION
    && typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && Array.isArray(candidate.assets)
    && Array.isArray(candidate.tracks)
    && Array.isArray(candidate.mappings)
    && Array.isArray(candidate.macros)
    && Array.isArray(candidate.scenes)
    && Array.isArray(candidate.automation)
    && typeof candidate.midi === "object"
    && typeof candidate.loop === "object"
    && typeof candidate.interaction === "object";
}

function migrateVersion2(candidate: Record<string, unknown>): Project {
  const base = createEmptyProject(typeof candidate["name"] === "string" ? candidate["name"] : "Migrated project");
  const tracks = Array.isArray(candidate["tracks"]) ? candidate["tracks"] : [];
  return {
    ...base,
    ...candidate,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tracks: tracks.map((track) => {
      const typedTrack = track as Partial<ProjectTrack>;
      return { ...typedTrack, audioState: { ...defaultAudioTrackState(), ...typedTrack.audioState } } as ProjectTrack;
    }),
    macros: [],
    automation: [],
    midi: base.midi
  } as Project;
}

function migrateVersion3(candidate: Record<string, unknown>): Project {
  const base = createEmptyProject(typeof candidate["name"] === "string" ? candidate["name"] : "Migrated project");
  const tracks = Array.isArray(candidate["tracks"]) ? candidate["tracks"] : [];
  return {
    ...base,
    ...candidate,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tracks: tracks.map((track) => {
      const typedTrack = track as Partial<ProjectTrack>;
      return { ...typedTrack, audioState: { ...defaultAudioTrackState(), ...typedTrack.audioState } } as ProjectTrack;
    })
  } as Project;
}

function migrateVersion4(candidate: Record<string, unknown>): Project {
  const base = createEmptyProject(typeof candidate["name"] === "string" ? candidate["name"] : "Migrated project");
  const tracks = Array.isArray(candidate["tracks"]) ? candidate["tracks"] : [];
  return {
    ...base,
    ...candidate,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tracks: tracks.map((track) => {
      const typedTrack = track as Partial<ProjectTrack>;
      return { ...typedTrack, audioState: { ...defaultAudioTrackState(), ...typedTrack.audioState } } as ProjectTrack;
    })
  } as Project;
}

function migrateVersion1(candidate: Record<string, unknown>): Project {
  const base = createEmptyProject(typeof candidate["name"] === "string" ? candidate["name"] : "Migrated project");
  const tracks = Array.isArray(candidate["tracks"]) ? candidate["tracks"] : [];
  return {
    ...base,
    ...candidate,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tracks: tracks.map((track) => {
      const typedTrack = track as Partial<ProjectTrack>;
      return {
        ...typedTrack,
        audioState: { ...defaultAudioTrackState(), ...typedTrack.audioState }
      } as ProjectTrack;
    }),
    interaction: base.interaction
  } as Project;
}

export function parseProject(value: unknown): Project {
  if (isProject(value)) return structuredClone(value);
  if (typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === 4) {
    return migrateVersion4(value as Record<string, unknown>);
  }
  if (typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === 3) {
    return migrateVersion3(value as Record<string, unknown>);
  }
  if (typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === 2) {
    return migrateVersion2(value as Record<string, unknown>);
  }
  if (typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === 1) {
    return migrateVersion1(value as Record<string, unknown>);
  }
  throw new Error("This file is not a supported Gesture Stem Workstation project.");
}

export function deserializeProject(serialized: string): Project {
  return parseProject(JSON.parse(serialized) as unknown);
}

export function serializeProject(project: Project): string {
  const portable: Project = {
    ...project,
    assets: project.assets.map(({ objectUrl: _objectUrl, ...asset }) => asset)
  };
  return JSON.stringify(portable, null, 2);
}
