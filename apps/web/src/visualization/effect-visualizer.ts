import type { GestureFrame } from "@gsw/gesture-domain";
import type { ProjectTrack, TrackRole } from "@gsw/project-schema";
import * as THREE from "three";
import { mapHandToUpperLeftEffectRegion } from "./effect-layout";
import {
  BatchedRenderer,
  CircleEmitter,
  ConeEmitter,
  ConstantColor,
  ConstantValue,
  GridEmitter,
  IntervalValue,
  OrbitOverLife,
  ParticleSystem,
  RenderMode,
  SphereEmitter,
  Vector3 as QuarksVector3,
  Vector4 as QuarksVector4,
  type Behavior,
  type EmitterShape,
  type Particle,
  type StretchedBillBoardSettings
} from "three.quarks";

type MutableEmitter = EmitterShape & Partial<{
  radius: number;
  width: number;
  height: number;
  spread: number;
  angle: number;
}>;

interface TrackPreset {
  renderMode: RenderMode;
  shape: MutableEmitter;
  life: [number, number];
  speed: [number, number];
  size: [number, number];
  emission: number;
  orbit: number;
  stretch: number;
}

class GestureTurbulenceBehavior implements Behavior {
  readonly type = "GestureTurbulence";
  strength = 0;
  #time = 0;

  initialize(): void {}

  update(particle: Particle, delta: number): void {
    if (this.strength <= 0) return;
    const phase = this.#time * 3.1 + particle.age * 5.7;
    particle.velocity.x += Math.sin(phase + particle.position.y * 1.7) * this.strength * delta;
    particle.velocity.y += Math.cos(phase * 0.83 + particle.position.x * 1.3) * this.strength * delta;
    particle.velocity.z += Math.sin(phase * 0.61 + particle.position.z) * this.strength * delta * 0.65;
  }

  frameUpdate(delta: number): void {
    this.#time += delta;
  }

  toJSON(): { type: string; strength: number } {
    return { type: this.type, strength: this.strength };
  }

  clone(): Behavior {
    const clone = new GestureTurbulenceBehavior();
    clone.strength = this.strength;
    return clone;
  }

  reset(): void {
    this.#time = 0;
  }
}

const presetForRole = (role: TrackRole): TrackPreset => {
  if (role === "drums") {
    return { renderMode: RenderMode.BillBoard, shape: new CircleEmitter({ radius: 0.42, thickness: 0.15 }), life: [0.18, 0.48], speed: [2.5, 5.5], size: [0.035, 0.09], emission: 58, orbit: 0.25, stretch: 0.15 };
  }
  if (role === "bass") {
    return { renderMode: RenderMode.BillBoard, shape: new SphereEmitter({ radius: 0.58, thickness: 0.7 }), life: [1.3, 2.7], speed: [0.35, 1.15], size: [0.05, 0.14], emission: 34, orbit: 1.15, stretch: 0.45 };
  }
  if (role === "melody" || role === "vocals") {
    return { renderMode: RenderMode.StretchedBillBoard, shape: new ConeEmitter({ radius: 0.12, angle: 0.2, thickness: 0.7 }), life: [1.1, 2.8], speed: [1.3, 3.1], size: [0.025, 0.065], emission: 42, orbit: 0.72, stretch: 1.45 };
  }
  return { renderMode: RenderMode.BillBoard, shape: new GridEmitter({ width: 1.5, height: 0.9, column: 7, row: 5 }), life: [1.8, 3.8], speed: [0.12, 0.8], size: [0.03, 0.1], emission: 28, orbit: 0.38, stretch: 0.7 };
};

export class QuarksEffectVisualizer {
  readonly #canvas: HTMLCanvasElement;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
  readonly #renderer: THREE.WebGLRenderer;
  readonly #batchRenderer = new BatchedRenderer();
  readonly #timer = new THREE.Timer();
  readonly #resizeObserver: ResizeObserver;
  readonly #particleTexture: THREE.DataTexture;
  #system: ParticleSystem | undefined;
  #material: THREE.MeshBasicMaterial | undefined;
  #preset: TrackPreset | undefined;
  #trackId: string | undefined;
  #turbulence: GestureTurbulenceBehavior | undefined;
  #orbit: OrbitOverLife | undefined;
  #frame: number | undefined;
  #lastGesture: GestureFrame | undefined;
  #stutterPhase = 0;
  #debugFrame = 0;
  #simulationScale = 1;
  #startColor: ConstantColor | undefined;
  #startLife: IntervalValue | undefined;
  #startSpeed: IntervalValue | undefined;
  #startSize: IntervalValue | undefined;
  #orbitSpeed: ConstantValue | undefined;
  readonly #signalColor = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.#timer.connect(document);
    this.#camera.position.z = 10;
    this.#scene.add(this.#batchRenderer);
    this.#particleTexture = this.#createParticleTexture();
    this.#renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      premultipliedAlpha: true
    });
    this.#renderer.setClearColor(0x000000, 0);
    this.#renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    const parent = canvas.parentElement;
    if (parent) this.#resizeObserver.observe(parent);
    this.#resize();
    this.#frame = requestAnimationFrame(this.#draw);
  }

  update(track: ProjectTrack | undefined, gesture: GestureFrame | undefined): void {
    this.#lastGesture = gesture;
    if (track?.id !== this.#trackId) this.#selectTrack(track);
    if (!track || !this.#system || !this.#preset || !this.#turbulence || !this.#orbit) return;
    const audio = track.audioState;
    const cutoff = Math.log10(Math.max(80, audio.filterCutoff) / 80) / Math.log10(250);
    const proximity = gesture?.features["right.z"] ?? 0.5;
    const handDistance = gesture?.features["hands.distance"] ?? 0.28;
    const resonance = Math.min(1, audio.filterResonance / 18);
    const direction = audio.reverseEnabled ? -1 : 1;
    const directionalRate = direction * (audio.reverseEnabled ? audio.reverseRate : 1);
    const emitter = this.#preset.shape;
    const radius = 0.18 + handDistance * 0.45;
    if ("radius" in emitter) emitter.radius = radius;
    if ("width" in emitter) emitter.width = radius * 1.8;
    if ("height" in emitter) emitter.height = radius * (0.65 + audio.reverbMix * 0.35);
    if ("spread" in emitter) emitter.spread = 0.05 + resonance * 0.45;
    if (!this.#startSize || !this.#startLife || !this.#startSpeed || !this.#orbitSpeed) return;
    this.#startSize.a = this.#preset.size[0] * (0.8 + proximity * 0.5);
    this.#startSize.b = this.#preset.size[1] * (0.9 + proximity * 0.65);
    this.#startLife.a = this.#preset.life[0] + audio.delayMix * 0.8;
    this.#startLife.b = this.#preset.life[1] + audio.reverbMix * 3.2;
    const speedA = this.#preset.speed[0] * directionalRate;
    const speedB = this.#preset.speed[1] * directionalRate;
    this.#startSpeed.a = Math.min(speedA, speedB);
    this.#startSpeed.b = Math.max(speedA, speedB);
    if (this.#system.renderMode === RenderMode.StretchedBillBoard) {
      const settings = this.#system.rendererEmitterSettings as StretchedBillBoardSettings;
      settings.speedFactor = this.#preset.stretch + audio.delayMix * 4.5;
      settings.lengthFactor = 0.18 + audio.reverbMix * 1.4;
    }
    this.#simulationScale = Math.max(0.025, 1 - audio.freezeFeedback * 0.96);
    this.#orbitSpeed.value = directionalRate * this.#preset.orbit * (0.35 + cutoff * 2.5);
    this.#turbulence.strength = resonance * 5.5 + audio.saturation * 1.8;
    this.#signalColor.set(getComputedStyle(document.body).getPropertyValue("--signal").trim() || "#00e5ff");
    this.#startColor?.color.set(this.#signalColor.r, this.#signalColor.g, this.#signalColor.b, 0.9);
    const rightX = gesture?.features["right.x"] ?? 0.24;
    const rightY = gesture?.features["right.y"] ?? 0.34;
    const aspect = this.#canvas.clientWidth / Math.max(1, this.#canvas.clientHeight);
    const placement = mapHandToUpperLeftEffectRegion(rightX, rightY);
    this.#system.emitter.position.set(
      placement.normalizedX * aspect * 5,
      placement.normalizedY * 5,
      (proximity - 0.5) * 0.8
    );
  }

  destroy(): void {
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    this.#resizeObserver.disconnect();
    this.#disposeSystem();
    this.#particleTexture.dispose();
    this.#timer.dispose();
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
  }

  #selectTrack(track: ProjectTrack | undefined): void {
    this.#disposeSystem();
    this.#trackId = track?.id;
    if (!track) return;
    this.#preset = presetForRole(track.role);
    this.#canvas.dataset.effectPreset = track.role;
    const style = getComputedStyle(document.body);
    const color = new THREE.Color(style.getPropertyValue("--signal").trim() || "#00e5ff");
    const opacity = track.role === "bass" ? 0.72 : 0.9;
    this.#material = new THREE.MeshBasicMaterial({
      map: this.#particleTexture,
      color: 0xffffff,
      transparent: true,
      opacity,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false
    });
    this.#turbulence = new GestureTurbulenceBehavior();
    this.#orbitSpeed = new ConstantValue(this.#preset.orbit);
    this.#orbit = new OrbitOverLife(this.#orbitSpeed, new QuarksVector3(0, 0, 1));
    this.#startColor = new ConstantColor(new QuarksVector4(color.r, color.g, color.b, opacity));
    this.#startLife = new IntervalValue(...this.#preset.life);
    this.#startSpeed = new IntervalValue(...this.#preset.speed);
    this.#startSize = new IntervalValue(...this.#preset.size);
    this.#system = new ParticleSystem({
      duration: 4,
      looping: true,
      worldSpace: true,
      shape: this.#preset.shape,
      startLife: this.#startLife,
      startSpeed: this.#startSpeed,
      startSize: this.#startSize,
      startLength: new ConstantValue(this.#preset.stretch),
      startColor: this.#startColor,
      emissionOverTime: new ConstantValue(this.#preset.emission),
      material: this.#material,
      renderMode: this.#preset.renderMode,
      speedFactor: this.#preset.stretch,
      renderOrder: 1,
      behaviors: [this.#orbit, this.#turbulence]
    });
    this.#scene.add(this.#system.emitter);
    this.#batchRenderer.addSystem(this.#system);
    this.#system.play();
  }

  #disposeSystem(): void {
    if (this.#system) {
      this.#batchRenderer.deleteSystem(this.#system);
      this.#scene.remove(this.#system.emitter);
      this.#system.stop();
      this.#system.dispose();
    }
    this.#material?.dispose();
    this.#system = undefined;
    this.#material = undefined;
    this.#preset = undefined;
    this.#turbulence = undefined;
    this.#orbit = undefined;
    this.#orbitSpeed = undefined;
    this.#startColor = undefined;
    this.#startLife = undefined;
    this.#startSpeed = undefined;
    this.#startSize = undefined;
  }

  #draw = (timestamp: number): void => {
    this.#timer.update(timestamp);
    const delta = Math.min(0.05, this.#timer.getDelta());
    if (this.#system && this.#preset) {
      const audioStutter = this.#lastGesture?.features["right.pinch"] ?? 1;
      this.#stutterPhase += delta;
      const quantizedBurst = audioStutter < 0.32 && Math.floor(this.#stutterPhase * 12) % 3 === 0;
      const emission = this.#system.emissionOverTime;
      if (emission instanceof ConstantValue) emission.value = quantizedBurst ? this.#preset.emission * 4 : this.#preset.emission;
    }
    this.#batchRenderer.update(delta * this.#simulationScale);
    this.#renderer.render(this.#scene, this.#camera);
    this.#debugFrame = (this.#debugFrame + 1) % 15;
    if (this.#debugFrame === 0) {
      this.#canvas.dataset.particleCount = String(this.#system?.particleNum ?? 0);
      this.#canvas.dataset.drawCalls = String(this.#renderer.info.render.calls);
      this.#canvas.dataset.triangles = String(this.#renderer.info.render.triangles);
    }
    this.#frame = requestAnimationFrame(this.#draw);
  };

  #resize(): void {
    const parent = this.#canvas.parentElement;
    if (!parent) return;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    const aspect = width / height;
    this.#camera.left = -5 * aspect;
    this.#camera.right = 5 * aspect;
    this.#camera.top = 5;
    this.#camera.bottom = -5;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height, false);
  }

  #createParticleTexture(): THREE.DataTexture {
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const distance = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
        const alpha = distance <= 0.72 ? 1 : Math.max(0, Math.min(1, (0.84 - distance) / 0.12));
        const offset = (y * size + x) * 4;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = Math.round(alpha * 255);
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
