import type { LoopRegion } from "@gsw/project-schema";

export interface TransportSnapshot {
  state: "stopped" | "playing" | "paused";
  currentSeconds: number;
  durationSeconds: number;
  loop: LoopRegion;
}

type TransportListener = (snapshot: TransportSnapshot) => void;

export class ProjectTransport {
  readonly #context: AudioContext;
  #state: TransportSnapshot["state"] = "stopped";
  #offsetSeconds = 0;
  #startedAtContextTime = 0;
  #durationSeconds = 0;
  #loop: LoopRegion = { enabled: false, startSeconds: 0, endSeconds: 16 };
  #listeners = new Set<TransportListener>();
  #animationFrame: number | undefined;
  #onSchedule: ((offsetSeconds: number) => void) | undefined;
  #onStop: (() => void) | undefined;

  constructor(context: AudioContext) {
    this.#context = context;
  }

  configureAudioCallbacks(schedule: (offsetSeconds: number) => void, stop: () => void): void {
    this.#onSchedule = schedule;
    this.#onStop = stop;
  }

  subscribe(listener: TransportListener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  get snapshot(): TransportSnapshot {
    return {
      state: this.#state,
      currentSeconds: this.#currentSeconds(),
      durationSeconds: this.#durationSeconds,
      loop: { ...this.#loop }
    };
  }

  setDuration(seconds: number): void {
    this.#durationSeconds = Math.max(0, seconds);
    this.#offsetSeconds = Math.min(this.#offsetSeconds, this.#durationSeconds);
    this.#emit();
  }

  setLoop(loop: LoopRegion): void {
    const start = Math.max(0, Math.min(loop.startSeconds, this.#durationSeconds));
    const end = Math.max(start + 0.1, Math.min(loop.endSeconds, this.#durationSeconds || loop.endSeconds));
    this.#loop = { enabled: loop.enabled, startSeconds: start, endSeconds: end };
    this.#emit();
  }

  async play(): Promise<void> {
    if (this.#state === "playing" || this.#durationSeconds === 0) return;
    await this.#context.resume();
    if (this.#offsetSeconds >= this.#durationSeconds) this.#offsetSeconds = 0;
    this.#startedAtContextTime = this.#context.currentTime;
    this.#state = "playing";
    this.#onSchedule?.(this.#offsetSeconds);
    this.#tick();
    this.#emit();
  }

  pause(): void {
    if (this.#state !== "playing") return;
    this.#offsetSeconds = this.#currentSeconds();
    this.#state = "paused";
    this.#onStop?.();
    this.#cancelTick();
    this.#emit();
  }

  stop(): void {
    this.#state = "stopped";
    this.#offsetSeconds = 0;
    this.#onStop?.();
    this.#cancelTick();
    this.#emit();
  }

  seek(seconds: number): void {
    const shouldResume = this.#state === "playing";
    this.#onStop?.();
    this.#offsetSeconds = Math.max(0, Math.min(seconds, this.#durationSeconds));
    this.#startedAtContextTime = this.#context.currentTime;
    if (shouldResume) this.#onSchedule?.(this.#offsetSeconds);
    this.#emit();
  }

  #currentSeconds(): number {
    if (this.#state !== "playing") return this.#offsetSeconds;
    return Math.min(this.#durationSeconds, this.#offsetSeconds + this.#context.currentTime - this.#startedAtContextTime);
  }

  #tick = (): void => {
    if (this.#state !== "playing") return;
    const current = this.#currentSeconds();
    if (this.#loop.enabled && current >= this.#loop.endSeconds) {
      this.seek(this.#loop.startSeconds);
    } else if (current >= this.#durationSeconds) {
      this.stop();
      return;
    }
    this.#emit();
    this.#animationFrame = requestAnimationFrame(this.#tick);
  };

  #cancelTick(): void {
    if (this.#animationFrame !== undefined) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
  }

  #emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }
}

