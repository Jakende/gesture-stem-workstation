import { isIndividualFingerFeature, type GestureControlMode } from "@gsw/gesture-domain";
import type { GestureMapping } from "@gsw/project-schema";

export const CLASSIC_HAND_MAPPINGS: GestureMapping[] = [
  {
    id: "classic-track-selection",
    source: "left.x",
    target: { type: "track-selection", parameter: "track.index" },
    transform: { inputMin: 0.08, inputMax: 0.92, outputMin: 0, outputMax: 0.999, curve: "linear", invert: false, smoothing: 0.38 },
    enabled: true
  },
  {
    id: "classic-right-y-cutoff",
    source: "right.y",
    target: { type: "selected-track-parameter", parameter: "filter.cutoff" },
    transform: { inputMin: 0.12, inputMax: 0.88, outputMin: 80, outputMax: 20_000, curve: "exp", invert: true, smoothing: 0.82, deadZone: 0.02 },
    enabled: true
  },
  {
    id: "classic-right-x-pan",
    source: "right.x",
    target: { type: "selected-track-parameter", parameter: "pan" },
    transform: { inputMin: 0.1, inputMax: 0.9, outputMin: -1, outputMax: 1, curve: "s", invert: false, smoothing: 0.84, deadZone: 0.03 },
    enabled: true
  },
  {
    id: "classic-right-z-depth",
    source: "right.z",
    target: { type: "selected-track-parameter", parameter: "filter.modDepth" },
    transform: { inputMin: 0.08, inputMax: 0.92, outputMin: 0, outputMax: 1, curve: "s", invert: false, smoothing: 0.86 },
    enabled: true
  },
  {
    id: "classic-right-pinch-resonance",
    source: "right.pinch",
    target: { type: "selected-track-parameter", parameter: "filter.resonance" },
    transform: { inputMin: 0.08, inputMax: 0.9, outputMin: 0.7, outputMax: 16, curve: "s", invert: true, smoothing: 0.82 },
    enabled: true
  },
  {
    id: "classic-right-open-reverb",
    source: "right.openness",
    target: { type: "selected-track-parameter", parameter: "reverb.mix" },
    transform: { inputMin: 0.15, inputMax: 0.9, outputMin: 0, outputMax: 0.75, curve: "s", invert: false, smoothing: 0.86 },
    enabled: true
  },
  {
    id: "classic-left-y-gain",
    source: "left.y",
    target: { type: "selected-track-parameter", parameter: "gain" },
    transform: { inputMin: 0.12, inputMax: 0.88, outputMin: 0.2, outputMax: 1.15, curve: "s", invert: true, smoothing: 0.86 },
    enabled: true
  },
  {
    id: "classic-left-z-feedback",
    source: "left.z",
    target: { type: "selected-track-parameter", parameter: "delay.feedback" },
    transform: { inputMin: 0.08, inputMax: 0.92, outputMin: 0.05, outputMax: 0.72, curve: "s", invert: false, smoothing: 0.86 },
    enabled: true
  },
  {
    id: "classic-hands-angle-delay",
    source: "hands.angle",
    target: { type: "selected-track-parameter", parameter: "delay.mix" },
    transform: { inputMin: 0.15, inputMax: 0.85, outputMin: 0, outputMax: 0.7, curve: "s", invert: false, smoothing: 0.86 },
    enabled: true
  },
  {
    id: "classic-left-open-freeze",
    source: "left.openness",
    target: { type: "selected-track-parameter", parameter: "freeze.feedback" },
    transform: { inputMin: 0.2, inputMax: 0.9, outputMin: 0, outputMax: 0.96, curve: "s", invert: true, smoothing: 0.88 },
    enabled: true
  },
  {
    id: "classic-left-velocity-stutter-rate",
    source: "left.velocity.x",
    target: { type: "selected-track-parameter", parameter: "stutter.seconds" },
    transform: { inputMin: 0.05, inputMax: 0.95, outputMin: 0.03125, outputMax: 0.5, curve: "exp", invert: true, smoothing: 0.8 },
    enabled: true
  },
  {
    id: "classic-left-velocity-reverse-rate",
    source: "left.velocity.y",
    target: { type: "selected-track-parameter", parameter: "reverse.rate" },
    transform: { inputMin: 0.05, inputMax: 0.95, outputMin: 0.5, outputMax: 2, curve: "s", invert: false, smoothing: 0.82 },
    enabled: true
  },
  {
    id: "classic-right-velocity-saturation",
    source: "right.velocity.x",
    target: { type: "selected-track-parameter", parameter: "saturation" },
    transform: { inputMin: 0.05, inputMax: 0.95, outputMin: 0, outputMax: 1, curve: "s", invert: false, smoothing: 0.82 },
    enabled: true
  },
  {
    id: "classic-right-velocity-tremolo",
    source: "right.velocity.y",
    target: { type: "selected-track-parameter", parameter: "tremolo.depth" },
    transform: { inputMin: 0.05, inputMax: 0.95, outputMin: 0, outputMax: 1, curve: "s", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "classic-right-yaw-filter-rate",
    source: "right.rotation.yaw",
    target: { type: "selected-track-parameter", parameter: "filter.modRate" },
    transform: { inputMin: 0.2, inputMax: 0.8, outputMin: 0.05, outputMax: 12, curve: "exp", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "classic-hands-distance-resynthesis",
    source: "hands.distance",
    target: { type: "selected-track-parameter", parameter: "resynthesis.mix" },
    transform: { inputMin: 0.08, inputMax: 0.72, outputMin: 0, outputMax: 1, curve: "s", invert: false, smoothing: 0.82 },
    enabled: true
  }
];

export const mappingsForGestureMode = (
  mode: GestureControlMode,
  fingerMappings: GestureMapping[]
): GestureMapping[] => {
  const learnedClassicMappings = fingerMappings.filter((mapping) => mapping.id.startsWith("classic-learned-"));
  if (mode === "finger") {
    return fingerMappings.filter((mapping) => !mapping.id.startsWith("classic-learned-"));
  }
  const learnedTargets = new Set(learnedClassicMappings.map((mapping) => mapping.target.parameter));
  return [
    ...CLASSIC_HAND_MAPPINGS.filter((mapping) => !learnedTargets.has(mapping.target.parameter)),
    ...learnedClassicMappings
  ];
};

export const profileUsesIndividualFingers = (mappings: GestureMapping[]): boolean => (
  mappings.some((mapping) => isIndividualFingerFeature(mapping.source))
);
