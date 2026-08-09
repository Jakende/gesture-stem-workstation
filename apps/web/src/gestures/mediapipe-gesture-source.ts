import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  ExponentialSmoother,
  extractHandGestureFeatures,
  type GestureFrame,
  type GestureSource,
  type HandSide,
  type Unsubscribe
} from "@gsw/gesture-domain";

const WASM_ROOT = import.meta.env.DEV ? "/__mediapipe_wasm" : "/mediapipe-wasm";
const MODEL_URL = import.meta.env.DEV ? "/__models/hand_landmarker.task" : "/models/hand_landmarker.task";

type FrameCallback = (frame: GestureFrame) => void;

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

export class MediaPipeGestureSource implements GestureSource {
  readonly #video: HTMLVideoElement;
  readonly #canvas: HTMLCanvasElement;
  #callbacks = new Set<FrameCallback>();
  #landmarker: HandLandmarker | undefined;
  #stream: MediaStream | undefined;
  #animationFrame: number | undefined;
  #mirrored = true;
  #depthSmoothers: Record<HandSide, ExponentialSmoother> = {
    left: new ExponentialSmoother(0.76),
    right: new ExponentialSmoother(0.76)
  };
  #previousPositions = new Map<HandSide, { x: number; y: number }>();
  #previousTimestamp = 0;

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.#video = video;
    this.#canvas = canvas;
  }

  subscribe(callback: FrameCallback): Unsubscribe {
    this.#callbacks.add(callback);
    return () => this.#callbacks.delete(callback);
  }

  async start(): Promise<void> {
    this.stop();
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.#landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });
    this.#stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540, frameRate: { ideal: 60, min: 30 } }, audio: false });
    this.#video.srcObject = this.#stream;
    await this.#video.play();
    this.#tick();
  }

  stop(): void {
    if (this.#animationFrame !== undefined) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = undefined;
    this.#landmarker?.close();
    this.#landmarker = undefined;
    this.#video.srcObject = null;
    this.#previousPositions.clear();
    this.#previousTimestamp = 0;
  }

  setMirrored(mirrored: boolean): void {
    this.#mirrored = mirrored;
    this.#video.classList.toggle("is-mirrored", mirrored);
    this.#canvas.classList.toggle("is-mirrored", mirrored);
  }

  #tick = (): void => {
    if (!this.#landmarker || this.#video.readyState < 2) {
      this.#animationFrame = requestAnimationFrame(this.#tick);
      return;
    }
    const timestamp = performance.now();
    const result = this.#landmarker.detectForVideo(this.#video, timestamp);
    const features: GestureFrame["features"] = {};
    const handsVisible: HandSide[] = [];
    const positions = new Map<HandSide, { x: number; y: number; z: number }>();

    result.landmarks.forEach((landmarks, index) => {
      const category = result.handedness[index]?.[0]?.categoryName.toLowerCase();
      if (category !== "left" && category !== "right") return;
      const side = category;
      const wrist = landmarks[0];
      if (!wrist) return;
      handsVisible.push(side);
      const handFeatures = extractHandGestureFeatures(landmarks, side, this.#mirrored);
      Object.assign(features, handFeatures);
      const x = handFeatures[`${side}.x`];
      const y = handFeatures[`${side}.y`];
      const rawDepth = handFeatures[`${side}.z`];
      if (x === undefined || y === undefined || rawDepth === undefined) return;
      const z = this.#depthSmoothers[side].next(rawDepth);
      features[`${side}.z`] = z;
      positions.set(side, { x, y, z });
      const previous = this.#previousPositions.get(side);
      const elapsedSeconds = Math.max(1 / 120, (timestamp - this.#previousTimestamp) / 1_000);
      features[`${side}.velocity.x`] = previous
        ? Math.max(0, Math.min(1, 0.5 + (x - previous.x) / elapsedSeconds / 6))
        : 0.5;
      features[`${side}.velocity.y`] = previous
        ? Math.max(0, Math.min(1, 0.5 + (y - previous.y) / elapsedSeconds / 6))
        : 0.5;
    });
    const left = positions.get("left");
    const right = positions.get("right");
    if (left && right) {
      const deltaX = right.x - left.x;
      const deltaY = right.y - left.y;
      features["hands.distance"] = Math.min(1, Math.hypot(deltaX, deltaY));
      features["hands.angle"] = Math.max(0, Math.min(1, 0.5 + Math.atan2(deltaY, deltaX) / (2 * Math.PI)));
      features["hands.depthDifference"] = Math.min(1, Math.abs(left.z - right.z));
    }
    this.#previousPositions = new Map([...positions].map(([side, position]) => [side, { x: position.x, y: position.y }]));
    this.#previousTimestamp = timestamp;

    this.#draw(result.landmarks, result.handedness.map((categories) => categories[0]?.categoryName.toLowerCase()));
    const frame: GestureFrame = { timestamp, features, handsVisible };
    for (const callback of this.#callbacks) callback(frame);
    this.#animationFrame = requestAnimationFrame(this.#tick);
  };

  #draw(hands: NormalizedLandmark[][], sides: Array<string | undefined>): void {
    const context = this.#canvas.getContext("2d");
    if (!context) return;
    const width = this.#canvas.width = this.#video.videoWidth || 960;
    const height = this.#canvas.height = this.#video.videoHeight || 540;
    context.clearRect(0, 0, width, height);
    const styles = getComputedStyle(document.body);
    const signal = styles.getPropertyValue("--signal").trim() || "#00e5ff";
    const surface = styles.getPropertyValue("--surface").trim() || "#000000";
    for (const [handIndex, landmarks] of hands.entries()) {
      context.strokeStyle = signal;
      context.globalAlpha = sides[handIndex] === "left" ? 0.48 : 0.72;
      context.lineWidth = 1.25;
      for (const [fromIndex, toIndex] of HAND_CONNECTIONS) {
        const from = landmarks[fromIndex];
        const to = landmarks[toIndex];
        if (!from || !to) continue;
        context.beginPath();
        context.moveTo(from.x * width, from.y * height);
        context.lineTo(to.x * width, to.y * height);
        context.stroke();
      }
      context.globalAlpha = 1;
      for (const [landmarkIndex, landmark] of landmarks.entries()) {
        const isTip = [4, 8, 12, 16, 20].includes(landmarkIndex);
        const radius = isTip ? 4.5 : 3;
        context.fillStyle = signal;
        context.beginPath();
        context.arc(landmark.x * width, landmark.y * height, radius, 0, Math.PI * 2);
        context.fill();
        if (sides[handIndex] === "right") {
          context.strokeStyle = surface;
          context.lineWidth = 1;
          context.stroke();
        }
      }
    }
  }
}
