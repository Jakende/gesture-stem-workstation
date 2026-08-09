import * as Tone from "tone";
import type { AudioTrackState, ProjectTrack } from "@gsw/project-schema";

interface TrackRuntime {
  buffer: AudioBuffer;
  reversedBuffer: AudioBuffer;
  originalGain: GainNode;
  synthGain: GainNode;
  synthFilter: BiquadFilterNode;
  saturation: WaveShaperNode;
  saturationAmount: number;
  bitCrusher: WaveShaperNode;
  bitDepthValue: number;
  tremolo: GainNode;
  tremoloOscillator: OscillatorNode;
  tremoloAmount: GainNode;
  freezeDelay: DelayNode;
  freezeFeedback: GainNode;
  freezeWet: GainNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  filterModOscillator: OscillatorNode;
  filterModAmount: GainNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  reverb: ConvolverNode;
  reverbWet: GainNode;
  gain: GainNode;
  pan: StereoPannerNode;
  source: AudioBufferSourceNode | undefined;
  sourceOffsetSeconds: number;
  synthSources: OscillatorNode[];
  state: AudioTrackState;
  track: ProjectTrack;
}

export class TrackAudioEngine {
  readonly context: AudioContext;
  readonly #master: GainNode;
  readonly #recordingDestination: MediaStreamAudioDestinationNode;
  readonly #reverbImpulse: AudioBuffer;
  #tracks = new Map<string, TrackRuntime>();
  #recorder: MediaRecorder | undefined;
  #recordedChunks: Blob[] = [];

  constructor() {
    this.context = Tone.getContext().rawContext as AudioContext;
    this.#master = this.context.createGain();
    this.#master.gain.value = 0.9;
    this.#recordingDestination = this.context.createMediaStreamDestination();
    this.#reverbImpulse = this.#createReverbImpulse(1.8);
    this.#master.connect(this.context.destination);
    this.#master.connect(this.#recordingDestination);
  }

  addTrack(track: ProjectTrack, buffer: AudioBuffer): void {
    this.removeTrack(track.id);
    const reversedBuffer = this.#reverseBuffer(buffer);
    const highpass = this.context.createBiquadFilter();
    highpass.type = "highpass";
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = "lowpass";
    const filterModOscillator = this.context.createOscillator();
    const filterModAmount = this.context.createGain();
    const delay = this.context.createDelay(1.5);
    const delayFeedback = this.context.createGain();
    const delayWet = this.context.createGain();
    const reverb = this.context.createConvolver();
    reverb.buffer = this.#reverbImpulse;
    const reverbWet = this.context.createGain();
    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    const originalGain = this.context.createGain();
    const synthGain = this.context.createGain();
    const synthFilter = this.context.createBiquadFilter();
    const saturation = this.context.createWaveShaper();
    saturation.oversample = "2x";
    const bitCrusher = this.context.createWaveShaper();
    const tremolo = this.context.createGain();
    const tremoloOscillator = this.context.createOscillator();
    const tremoloAmount = this.context.createGain();
    const freezeDelay = this.context.createDelay(0.25);
    freezeDelay.delayTime.value = 0.047;
    const freezeFeedback = this.context.createGain();
    const freezeWet = this.context.createGain();
    synthFilter.type = "lowpass";
    originalGain.connect(highpass);
    synthGain.connect(synthFilter).connect(highpass);
    highpass.connect(lowpass).connect(saturation).connect(bitCrusher).connect(tremolo);
    filterModOscillator.connect(filterModAmount).connect(lowpass.detune);
    filterModOscillator.start();
    tremolo.connect(gain);
    tremolo.connect(delay);
    delay.connect(delayWet).connect(gain);
    delay.connect(delayFeedback).connect(delay);
    tremolo.connect(reverb).connect(reverbWet).connect(gain);
    tremolo.connect(freezeDelay).connect(freezeWet).connect(gain);
    freezeDelay.connect(freezeFeedback).connect(freezeDelay);
    tremoloOscillator.connect(tremoloAmount).connect(tremolo.gain);
    tremoloOscillator.start();
    gain.connect(pan).connect(this.#master);
    this.#tracks.set(track.id, {
      buffer,
      reversedBuffer,
      originalGain,
      synthGain,
      synthFilter,
      saturation,
      saturationAmount: Number.NaN,
      bitCrusher,
      bitDepthValue: Number.NaN,
      tremolo,
      tremoloOscillator,
      tremoloAmount,
      freezeDelay,
      freezeFeedback,
      freezeWet,
      highpass,
      lowpass,
      filterModOscillator,
      filterModAmount,
      delay,
      delayFeedback,
      delayWet,
      reverb,
      reverbWet,
      gain,
      pan,
      source: undefined,
      sourceOffsetSeconds: 0,
      synthSources: [],
      state: { ...track.audioState },
      track: structuredClone(track)
    });
    this.updateTrack(track);
  }

  removeTrack(trackId: string): void {
    const runtime = this.#tracks.get(trackId);
    if (!runtime) return;
    try { runtime.source?.stop(); } catch { /* source may already be stopped */ }
    runtime.highpass.disconnect();
    runtime.originalGain.disconnect();
    runtime.synthGain.disconnect();
    runtime.synthFilter.disconnect();
    runtime.saturation.disconnect();
    runtime.bitCrusher.disconnect();
    runtime.tremolo.disconnect();
    runtime.tremoloOscillator.stop();
    runtime.tremoloOscillator.disconnect();
    runtime.tremoloAmount.disconnect();
    runtime.freezeDelay.disconnect();
    runtime.freezeFeedback.disconnect();
    runtime.freezeWet.disconnect();
    runtime.lowpass.disconnect();
    runtime.filterModOscillator.stop();
    runtime.filterModOscillator.disconnect();
    runtime.filterModAmount.disconnect();
    runtime.delay.disconnect();
    runtime.delayFeedback.disconnect();
    runtime.delayWet.disconnect();
    runtime.reverb.disconnect();
    runtime.reverbWet.disconnect();
    runtime.gain.disconnect();
    runtime.pan.disconnect();
    this.#tracks.delete(trackId);
  }

  updateTrack(track: ProjectTrack): void {
    const runtime = this.#tracks.get(track.id);
    if (!runtime) return;
    runtime.state = { ...track.audioState };
    const runtimeTrack: ProjectTrack = {
      ...track,
      audioState: { ...track.audioState }
    };
    if (track.synth) runtimeTrack.synth = { ...track.synth };
    runtime.track = runtimeTrack;
    const now = this.context.currentTime;
    runtime.highpass.frequency.setTargetAtTime(track.audioState.highpassCutoff, now, 0.015);
    runtime.lowpass.frequency.setTargetAtTime(track.audioState.filterCutoff, now, 0.015);
    runtime.lowpass.Q.setTargetAtTime(track.audioState.filterResonance, now, 0.015);
    runtime.filterModOscillator.frequency.setTargetAtTime(track.audioState.filterModRate, now, 0.02);
    runtime.filterModAmount.gain.setTargetAtTime(track.audioState.filterModDepth * 2_400, now, 0.02);
    runtime.delay.delayTime.setTargetAtTime(track.audioState.delayTime, now, 0.02);
    runtime.delayFeedback.gain.setTargetAtTime(track.audioState.delayFeedback, now, 0.02);
    runtime.delayWet.gain.setTargetAtTime(track.audioState.delayMix, now, 0.02);
    runtime.reverbWet.gain.setTargetAtTime(track.audioState.reverbMix, now, 0.025);
    runtime.pan.pan.setTargetAtTime(track.audioState.pan, now, 0.015);
    const synth = track.synth;
    const synthMix = synth?.enabled ? synth.mix : 0;
    runtime.originalGain.gain.setTargetAtTime(1 - synthMix, now, 0.02);
    runtime.synthGain.gain.setTargetAtTime(synthMix, now, 0.02);
    runtime.synthFilter.frequency.setTargetAtTime(synth?.filterCutoff ?? 8_000, now, 0.02);
    if (runtime.saturation.curve === null || Math.abs(runtime.saturationAmount - track.audioState.saturation) >= 0.02) {
      runtime.saturation.curve = this.#saturationCurve(track.audioState.saturation);
      runtime.saturationAmount = track.audioState.saturation;
    }
    if (runtime.bitCrusher.curve === null || Math.round(runtime.bitDepthValue) !== Math.round(track.audioState.bitDepth)) {
      runtime.bitCrusher.curve = this.#bitCrushCurve(track.audioState.bitDepth);
      runtime.bitDepthValue = track.audioState.bitDepth;
    }
    runtime.tremolo.gain.setTargetAtTime(1 - track.audioState.tremoloDepth / 2, now, 0.02);
    runtime.tremoloAmount.gain.setTargetAtTime(track.audioState.tremoloDepth / 2, now, 0.02);
    runtime.tremoloOscillator.frequency.setTargetAtTime(track.audioState.tremoloRate, now, 0.02);
    runtime.freezeFeedback.gain.setTargetAtTime(track.audioState.freezeFeedback, now, 0.03);
    runtime.freezeWet.gain.setTargetAtTime(track.audioState.freezeFeedback > 0 ? 0.62 : 0, now, 0.03);
    if (runtime.source) {
      runtime.source.playbackRate.setTargetAtTime(track.audioState.reverseEnabled ? track.audioState.reverseRate : 1, now, 0.025);
      runtime.source.loop = track.audioState.stutterEnabled;
      if (track.audioState.stutterEnabled) {
        runtime.source.loopStart = runtime.sourceOffsetSeconds;
        runtime.source.loopEnd = Math.min(
          runtime.buffer.duration,
          runtime.sourceOffsetSeconds + track.audioState.stutterSeconds
        );
      }
    }
    this.#applyMixState();
  }

  get duration(): number {
    return Math.max(0, ...[...this.#tracks.values()].map((runtime) => runtime.buffer.duration));
  }

  schedule(offsetSeconds: number): void {
    this.stopSources();
    const now = this.context.currentTime;
    for (const runtime of this.#tracks.values()) {
      if (offsetSeconds >= runtime.buffer.duration) continue;
      const source = this.context.createBufferSource();
      source.buffer = runtime.state.reverseEnabled ? runtime.reversedBuffer : runtime.buffer;
      source.playbackRate.value = runtime.state.reverseEnabled ? runtime.state.reverseRate : 1;
      if (runtime.state.stutterEnabled) {
        source.loop = true;
        source.loopStart = offsetSeconds;
        source.loopEnd = Math.min(runtime.buffer.duration, offsetSeconds + runtime.state.stutterSeconds);
      }
      source.connect(runtime.originalGain);
      source.start(now, offsetSeconds);
      runtime.source = source;
      runtime.sourceOffsetSeconds = offsetSeconds;
      this.#scheduleSynth(runtime, offsetSeconds, now);
    }
  }

  stopSources(): void {
    for (const runtime of this.#tracks.values()) {
      if (!runtime.source) continue;
      try { runtime.source.stop(); } catch { /* already ended */ }
      runtime.source.disconnect();
      runtime.source = undefined;
      for (const oscillator of runtime.synthSources) {
        try { oscillator.stop(); } catch { /* oscillator may already have ended */ }
        oscillator.disconnect();
      }
      runtime.synthSources = [];
    }
  }

  startRecording(): void {
    if (this.#recorder?.state === "recording") return;
    const preferred = "audio/webm;codecs=opus";
    const options = MediaRecorder.isTypeSupported(preferred) ? { mimeType: preferred } : undefined;
    this.#recordedChunks = [];
    this.#recorder = new MediaRecorder(this.#recordingDestination.stream, options);
    this.#recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.#recordedChunks.push(event.data);
    });
    this.#recorder.start(250);
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.#recorder || this.#recorder.state !== "recording") {
        reject(new Error("No performance recording is active."));
        return;
      }
      this.#recorder.addEventListener("stop", () => {
        resolve(new Blob(this.#recordedChunks, { type: this.#recorder?.mimeType || "audio/webm" }));
      }, { once: true });
      this.#recorder.stop();
    });
  }

  #applyMixState(): void {
    const hasSolo = [...this.#tracks.values()].some((runtime) => runtime.state.solo);
    const now = this.context.currentTime;
    for (const runtime of this.#tracks.values()) {
      const audible = !runtime.state.muted && (!hasSolo || runtime.state.solo);
      runtime.gain.gain.setTargetAtTime(audible ? runtime.state.gain : 0, now, 0.008);
    }
  }

  #scheduleSynth(runtime: TrackRuntime, offsetSeconds: number, now: number): void {
    const synth = runtime.track.synth;
    const notes = runtime.track.transcription?.notes;
    if (!synth?.enabled || !notes || synth.mix <= 0) return;
    for (const note of notes) {
      const noteEnd = note.startSeconds + note.durationSeconds;
      if (noteEnd <= offsetSeconds) continue;
      const startDelay = Math.max(0, note.startSeconds - offsetSeconds);
      const elapsed = Math.max(0, offsetSeconds - note.startSeconds);
      const remaining = note.durationSeconds - elapsed;
      if (remaining <= 0) continue;
      const startAt = now + startDelay;
      const stopAt = startAt + remaining + synth.release;
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      oscillator.type = synth.oscillator;
      oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, note.velocity / 127), startAt + synth.attack);
      envelope.gain.linearRampToValueAtTime(
        Math.max(0.001, (note.velocity / 127) * synth.sustain),
        startAt + synth.attack + synth.decay
      );
      envelope.gain.setValueAtTime(
        Math.max(0.001, (note.velocity / 127) * synth.sustain),
        Math.max(startAt + synth.attack + synth.decay, stopAt - synth.release)
      );
      envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      oscillator.connect(envelope).connect(runtime.synthGain);
      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.01);
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        envelope.disconnect();
        runtime.synthSources = runtime.synthSources.filter((candidate) => candidate !== oscillator);
      }, { once: true });
      runtime.synthSources.push(oscillator);
    }
  }

  #createReverbImpulse(durationSeconds: number): AudioBuffer {
    const length = Math.floor(this.context.sampleRate * durationSeconds);
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    let seed = 0x5eed1234;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0xffff_ffff;
    };
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        const decay = (1 - index / length) ** 2.6;
        data[index] = (random() * 2 - 1) * decay;
      }
    }
    return impulse;
  }

  #reverseBuffer(buffer: AudioBuffer): AudioBuffer {
    const reversed = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const source = buffer.getChannelData(channel);
      const target = reversed.getChannelData(channel);
      for (let index = 0; index < source.length; index += 1) target[index] = source[source.length - index - 1] ?? 0;
    }
    return reversed;
  }

  #saturationCurve(amount: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(512);
    const drive = 1 + Math.max(0, amount) * 18;
    const normalizer = Math.tanh(drive);
    for (let index = 0; index < curve.length; index += 1) {
      const input = index * 2 / (curve.length - 1) - 1;
      curve[index] = Math.tanh(input * drive) / normalizer;
    }
    return curve;
  }

  #bitCrushCurve(bitDepth: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(512);
    const levels = 2 ** Math.max(2, Math.min(16, Math.round(bitDepth)));
    for (let index = 0; index < curve.length; index += 1) {
      const input = index * 2 / (curve.length - 1) - 1;
      curve[index] = Math.round(input * levels) / levels;
    }
    return curve;
  }
}
