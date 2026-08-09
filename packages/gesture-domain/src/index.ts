export type HandSide = "left" | "right";
export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
export type LandmarkAxis = "x" | "y" | "z";
export type GestureControlMode = "finger" | "classic";
export type GestureFeatureName =
  | `${HandSide}.${"x" | "y" | "z" | "openness" | "pinch" | "palmFacing"}`
  | `${HandSide}.rotation.${"roll" | "pitch" | "yaw"}`
  | `${HandSide}.velocity.${"x" | "y"}`
  | `${HandSide}.${FingerName}.flexion`
  | `${HandSide}.${FingerName}.tip.${LandmarkAxis}`
  | "hands.distance"
  | "hands.angle"
  | "hands.depthDifference";

export type GestureFeatures = Partial<Record<GestureFeatureName, number>>;

export const isIndividualFingerFeature = (feature: string): boolean => (
  /\.(thumb|index|middle|ring|pinky)\.(flexion|tip\.)/.test(feature)
);

export interface GestureFrame {
  timestamp: number;
  features: GestureFeatures;
  handsVisible: HandSide[];
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

const FINGER_LANDMARKS: Record<FingerName, readonly [number, number, number, number]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20]
};

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

const subtract = (a: HandLandmark, b: HandLandmark): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vectorLength = (vector: Vector3): number => Math.hypot(vector.x, vector.y, vector.z);
const dot = (a: Vector3, b: Vector3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

const distance3d = (a: HandLandmark, b: HandLandmark): number => vectorLength(subtract(a, b));

const jointFlexion = (a: HandLandmark, b: HandLandmark, c: HandLandmark): number => {
  const incoming = subtract(a, b);
  const outgoing = subtract(c, b);
  const denominator = vectorLength(incoming) * vectorLength(outgoing);
  if (denominator <= Number.EPSILON) return 0;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(incoming, outgoing) / denominator)));
  return clamp01((Math.PI - angle) / Math.PI);
};

export function fingerFlexion(landmarks: readonly HandLandmark[], finger: FingerName): number {
  const [baseIndex, firstJointIndex, secondJointIndex, tipIndex] = FINGER_LANDMARKS[finger];
  const base = landmarks[baseIndex];
  const firstJoint = landmarks[firstJointIndex];
  const secondJoint = landmarks[secondJointIndex];
  const tip = landmarks[tipIndex];
  if (!base || !firstJoint || !secondJoint || !tip) return 0;
  return (
    jointFlexion(base, firstJoint, secondJoint)
    + jointFlexion(firstJoint, secondJoint, tip)
  ) / 2;
}

export function extractHandGestureFeatures(
  landmarks: readonly HandLandmark[],
  side: HandSide,
  mirrored: boolean
): GestureFeatures {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  if (!wrist || !indexMcp || !middleMcp || !pinkyMcp || !thumbTip || !indexTip) return {};
  const transformed = landmarks.map((landmark) => ({ ...landmark, x: mirrored ? 1 - landmark.x : landmark.x }));
  const transformedWrist = transformed[0];
  const transformedIndex = transformed[5];
  const transformedMiddle = transformed[9];
  const transformedPinky = transformed[17];
  if (!transformedWrist || !transformedIndex || !transformedMiddle || !transformedPinky) return {};

  const features: GestureFeatures = {};
  features[`${side}.x`] = clamp01(transformedWrist.x);
  features[`${side}.y`] = clamp01(transformedWrist.y);
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const landmark of transformed) {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
  }
  features[`${side}.z`] = clamp01((Math.hypot(maxX - minX, maxY - minY) - 0.16) / 0.46);
  features[`${side}.pinch`] = clamp01(distance3d(thumbTip, indexTip) / 0.16);
  const tipIndices = [8, 12, 16, 20];
  features[`${side}.openness`] = clamp01(
    tipIndices.reduce((sum, index) => {
      const tip = landmarks[index];
      return sum + (tip ? distance3d(wrist, tip) : 0);
    }, 0) / 1.45
  );

  for (const finger of Object.keys(FINGER_LANDMARKS) as FingerName[]) {
    const tip = transformed[FINGER_LANDMARKS[finger][3]];
    features[`${side}.${finger}.flexion`] = fingerFlexion(landmarks, finger);
    if (!tip) continue;
    features[`${side}.${finger}.tip.x`] = clamp01(tip.x);
    features[`${side}.${finger}.tip.y`] = clamp01(tip.y);
    features[`${side}.${finger}.tip.z`] = clamp01((tip.z + 0.25) / 0.5);
  }

  const acrossPalm = subtract(transformedIndex, transformedPinky);
  const alongPalm = subtract(transformedMiddle, transformedWrist);
  const canonicalSign = side === "right" ? -1 : 1;
  const canonicalAcross = {
    x: acrossPalm.x * canonicalSign,
    y: acrossPalm.y * canonicalSign,
    z: acrossPalm.z * canonicalSign
  };
  const roll = Math.atan2(canonicalAcross.y, canonicalAcross.x);
  const pitch = Math.atan2(alongPalm.z, Math.hypot(alongPalm.x, alongPalm.y));
  const yaw = Math.atan2(canonicalAcross.z, Math.hypot(canonicalAcross.x, canonicalAcross.y));
  features[`${side}.rotation.roll`] = clamp01(0.5 + roll / Math.PI);
  features[`${side}.rotation.pitch`] = clamp01(0.5 + pitch / Math.PI);
  features[`${side}.rotation.yaw`] = clamp01(0.5 + yaw / Math.PI);

  const indexVector = subtract(transformedIndex, transformedWrist);
  const pinkyVector = subtract(transformedPinky, transformedWrist);
  const palmNormal = cross(indexVector, pinkyVector);
  const normalLength = vectorLength(palmNormal);
  const mirrorSign = mirrored ? -1 : 1;
  const facing = normalLength <= Number.EPSILON
    ? 0.5
    : 0.5 + 0.5 * palmNormal.z / normalLength * canonicalSign * mirrorSign;
  features[`${side}.palmFacing`] = clamp01(facing);
  return features;
}

export type Unsubscribe = () => void;

export interface GestureSource {
  subscribe(callback: (frame: GestureFrame) => void): Unsubscribe;
  start(): Promise<void>;
  stop(): void;
}

export interface SignalTransform {
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
  curve: "linear" | "exp" | "log" | "s";
  invert: boolean;
  smoothing: number;
  deadZone?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

export function applyCurve(value: number, curve: SignalTransform["curve"]): number {
  const clamped = clamp01(value);
  if (curve === "exp") return clamped ** 2;
  if (curve === "log") return Math.sqrt(clamped);
  if (curve === "s") return clamped * clamped * (3 - 2 * clamped);
  return clamped;
}

export function mapSignal(value: number, transform: SignalTransform): number {
  let normalized = normalize(value, transform.inputMin, transform.inputMax);
  if (transform.deadZone !== undefined && Math.abs(normalized - 0.5) < transform.deadZone / 2) {
    normalized = 0.5;
  }
  if (transform.invert) normalized = 1 - normalized;
  const curved = applyCurve(normalized, transform.curve);
  return transform.outputMin + curved * (transform.outputMax - transform.outputMin);
}

export class ExponentialSmoother {
  readonly #amount: number;
  #value: number | undefined;

  constructor(amount: number) {
    this.#amount = clamp01(amount);
  }

  next(value: number): number {
    this.#value = this.#value === undefined
      ? value
      : this.#value * this.#amount + value * (1 - this.#amount);
    return this.#value;
  }

  reset(): void {
    this.#value = undefined;
  }
}

export interface TrackSelectionDecision {
  selectedIndex: number;
  candidateIndex?: number;
  candidateProgress: number;
  changed: boolean;
}

export class TrackSelectionStabilizer {
  #selectedIndex = 0;
  #candidateIndex: number | undefined;
  #candidateSince = 0;

  setSelected(index: number): void {
    this.#selectedIndex = Math.max(0, Math.floor(index));
    this.#candidateIndex = undefined;
  }

  next(
    normalizedPosition: number,
    trackCount: number,
    timestamp: number,
    dwellMs = 160,
    hysteresis = 0.14
  ): TrackSelectionDecision {
    if (trackCount <= 0) return { selectedIndex: 0, candidateProgress: 0, changed: false };
    this.#selectedIndex = Math.min(trackCount - 1, this.#selectedIndex);
    const position = clamp01(normalizedPosition);
    const zoneWidth = 1 / trackCount;
    const holdMargin = zoneWidth * Math.max(0, hysteresis);
    const holdStart = this.#selectedIndex * zoneWidth - holdMargin;
    const holdEnd = (this.#selectedIndex + 1) * zoneWidth + holdMargin;
    if (position >= holdStart && position <= holdEnd) {
      this.#candidateIndex = undefined;
      return { selectedIndex: this.#selectedIndex, candidateProgress: 0, changed: false };
    }

    const proposedIndex = Math.min(trackCount - 1, Math.floor(position * trackCount));
    if (proposedIndex === this.#selectedIndex) {
      this.#candidateIndex = undefined;
      return { selectedIndex: this.#selectedIndex, candidateProgress: 0, changed: false };
    }
    if (this.#candidateIndex !== proposedIndex) {
      this.#candidateIndex = proposedIndex;
      this.#candidateSince = timestamp;
    }
    const candidateProgress = Math.min(
      1,
      Math.max(0, (timestamp - this.#candidateSince) / Math.max(1, dwellMs))
    );
    if (candidateProgress < 1) {
      return {
        selectedIndex: this.#selectedIndex,
        candidateIndex: proposedIndex,
        candidateProgress,
        changed: false
      };
    }
    this.#selectedIndex = proposedIndex;
    this.#candidateIndex = undefined;
    return { selectedIndex: this.#selectedIndex, candidateProgress: 1, changed: true };
  }
}

export class SyntheticGestureSource implements GestureSource {
  #callbacks = new Set<(frame: GestureFrame) => void>();
  #animationFrame: number | undefined;
  #startTime = 0;

  subscribe(callback: (frame: GestureFrame) => void): Unsubscribe {
    this.#callbacks.add(callback);
    return () => this.#callbacks.delete(callback);
  }

  async start(): Promise<void> {
    this.stop();
    this.#startTime = performance.now();
    const emit = (timestamp: number): void => {
      const phase = (timestamp - this.#startTime) / 2200;
      const x = (Math.sin(phase * 0.73) + 1) / 2;
      const y = (Math.sin(phase) + 1) / 2;
      const wave = (offset: number, rate = 1): number => (Math.sin(phase * rate + offset) + 1) / 2;
      this.emit({
        timestamp,
        handsVisible: ["left", "right"],
        features: {
          "left.x": 1 - x,
          "left.y": 0.54,
          "left.z": (Math.sin(phase * 0.42) + 1) / 2,
          "left.openness": wave(0.3, 0.8),
          "left.pinch": wave(1.6, 1.4),
          "left.palmFacing": wave(0.4, 1.05),
          "left.rotation.roll": wave(0.2, 0.47),
          "left.rotation.pitch": wave(1.1, 0.39),
          "left.rotation.yaw": wave(2.2, 0.52),
          "left.velocity.x": wave(0.1, 0.73),
          "left.velocity.y": wave(1.5, 0.61),
          "left.thumb.flexion": wave(0.2, 1.17),
          "left.index.flexion": wave(0.8, 1.31),
          "left.middle.flexion": wave(1.4, 1.43),
          "left.ring.flexion": wave(2, 1.57),
          "left.pinky.flexion": wave(2.6, 1.69),
          "right.x": x,
          "right.y": y,
          "right.z": (Math.cos(phase * 0.42) + 1) / 2,
          "right.pinch": (Math.sin(phase * 1.6) + 1) / 2,
          "right.openness": (Math.cos(phase * 0.8) + 1) / 2,
          "right.palmFacing": wave(2.5, 1.15),
          "right.rotation.roll": wave(0.7, 0.43),
          "right.rotation.pitch": wave(1.7, 0.37),
          "right.rotation.yaw": wave(2.8, 0.49),
          "right.velocity.x": wave(2.1, 0.73),
          "right.velocity.y": wave(0.5, 0.61),
          "right.thumb.flexion": wave(0.5, 1.13),
          "right.index.flexion": wave(1.1, 1.29),
          "right.middle.flexion": wave(1.7, 1.41),
          "right.ring.flexion": wave(2.3, 1.53),
          "right.pinky.flexion": wave(2.9, 1.67),
          "hands.distance": Math.abs(1 - 2 * x),
          "hands.angle": wave(0.9, 0.41),
          "hands.depthDifference": Math.abs(Math.sin(phase * 0.42))
        }
      });
      this.#animationFrame = requestAnimationFrame(emit);
    };
    this.#animationFrame = requestAnimationFrame(emit);
  }

  emit(frame: GestureFrame): void {
    for (const callback of this.#callbacks) callback(frame);
  }

  stop(): void {
    if (this.#animationFrame !== undefined) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
  }
}
