import {
  SyntheticGestureSource,
  TrackSelectionStabilizer,
  isIndividualFingerFeature,
  type GestureFrame,
  type GestureControlMode,
  type GestureFeatureName,
  type GestureSource,
  type TrackSelectionDecision
} from "@gsw/gesture-domain";
import {
  defaultAudioTrackState,
  defaultSynthTrackState,
  type AudioTrackState,
  type GestureContinuousParameter,
  type GestureMapping,
  type ProjectTrack,
  type SynthTrackState,
  type TrackRole
} from "@gsw/project-schema";
import type { ProcessorHealth } from "@gsw/protocol";
import { encodeMidi } from "@gsw/music-domain";
import { downloadText, formatTime, queryRequired, setText } from "./dom";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  applyWorkspaceSettings,
  loadWorkspaceSettings,
  parseWorkspaceSettings,
  saveWorkspaceSettings,
  type WorkspaceSettings
} from "./workspace-settings";
import { TrackAudioEngine } from "../audio/track-audio-engine";
import { GestureMappingEngine } from "../gestures/gesture-mapping-engine";
import { mappingsForGestureMode } from "../gestures/gesture-control-profiles";
import { ProjectStore } from "../project/project-store";
import { ProcessorClient } from "../processor/processor-client";
import { WebMidiOutput } from "../midi/web-midi-output";
import { WaveformView } from "../timeline/waveform-view";
import { ProjectTransport } from "../transport/project-transport";
import type { QuarksEffectVisualizer } from "../visualization/effect-visualizer";

interface DemoStem {
  filename: string;
  role: TrackRole;
  name: string;
  url: string;
  available: boolean;
}

interface ImportableAudio {
  filename: string;
  role: TrackRole;
  name: string;
  url: string;
  mimeType: string;
  sha256?: string;
}

const FINGER_MAPPINGS: GestureMapping[] = [
  {
    id: "mapping-track-selection",
    source: "left.x",
    target: { type: "track-selection", parameter: "track.index" },
    transform: { inputMin: 0.08, inputMax: 0.92, outputMin: 0, outputMax: 0.999, curve: "linear", invert: false, smoothing: 0.38 },
    enabled: true
  },
  {
    id: "mapping-filter-cutoff",
    source: "right.index.flexion",
    target: { type: "selected-track-parameter", parameter: "filter.cutoff" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 80, outputMax: 20_000, curve: "exp", invert: true, smoothing: 0.78, deadZone: 0.02 },
    enabled: true
  },
  {
    id: "mapping-filter-resonance",
    source: "right.middle.flexion",
    target: { type: "selected-track-parameter", parameter: "filter.resonance" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 0.7, outputMax: 16, curve: "s", invert: false, smoothing: 0.8 },
    enabled: true
  },
  {
    id: "mapping-delay-feedback",
    source: "right.thumb.flexion",
    target: { type: "selected-track-parameter", parameter: "delay.feedback" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 0.05, outputMax: 0.72, curve: "s", invert: false, smoothing: 0.82 },
    enabled: true
  },
  {
    id: "mapping-delay-mix",
    source: "right.ring.flexion",
    target: { type: "selected-track-parameter", parameter: "delay.mix" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 0, outputMax: 0.7, curve: "s", invert: false, smoothing: 0.82 },
    enabled: true
  },
  {
    id: "mapping-reverb-mix",
    source: "right.pinky.flexion",
    target: { type: "selected-track-parameter", parameter: "reverb.mix" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 0, outputMax: 0.75, curve: "s", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "mapping-filter-mod-depth",
    source: "right.z",
    target: { type: "selected-track-parameter", parameter: "filter.modDepth" },
    transform: { inputMin: 0.08, inputMax: 0.92, outputMin: 0, outputMax: 1, curve: "s", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "mapping-right-roll-pan",
    source: "right.rotation.roll",
    target: { type: "selected-track-parameter", parameter: "pan" },
    transform: { inputMin: 0.15, inputMax: 0.85, outputMin: -1, outputMax: 1, curve: "s", invert: false, smoothing: 0.82, deadZone: 0.04 },
    enabled: true
  },
  {
    id: "mapping-right-pitch-highpass",
    source: "right.rotation.pitch",
    target: { type: "selected-track-parameter", parameter: "filter.highpass" },
    transform: { inputMin: 0.2, inputMax: 0.8, outputMin: 20, outputMax: 8_000, curve: "exp", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "mapping-right-yaw-filter-rate",
    source: "right.rotation.yaw",
    target: { type: "selected-track-parameter", parameter: "filter.modRate" },
    transform: { inputMin: 0.2, inputMax: 0.8, outputMin: 0.05, outputMax: 12, curve: "exp", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "mapping-left-thumb-delay-time",
    source: "left.thumb.flexion",
    target: { type: "selected-track-parameter", parameter: "delay.time" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 0.03, outputMax: 1.2, curve: "s", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "mapping-left-index-stutter-speed",
    source: "left.index.flexion",
    target: { type: "selected-track-parameter", parameter: "stutter.seconds" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 0.03125, outputMax: 0.5, curve: "exp", invert: true, smoothing: 0.78 },
    enabled: true
  },
  {
    id: "mapping-left-middle-reverse-speed",
    source: "left.middle.flexion",
    target: { type: "selected-track-parameter", parameter: "reverse.rate" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 0.5, outputMax: 2, curve: "s", invert: false, smoothing: 0.82 },
    enabled: true
  },
  {
    id: "mapping-left-ring-saturation",
    source: "left.ring.flexion",
    target: { type: "selected-track-parameter", parameter: "saturation" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 0, outputMax: 1, curve: "s", invert: false, smoothing: 0.82 },
    enabled: true
  },
  {
    id: "mapping-left-pinky-bits",
    source: "left.pinky.flexion",
    target: { type: "selected-track-parameter", parameter: "bitDepth" },
    transform: { inputMin: 0.05, inputMax: 0.9, outputMin: 2, outputMax: 16, curve: "s", invert: true, smoothing: 0.78 },
    enabled: true
  },
  {
    id: "mapping-left-roll-gain",
    source: "left.rotation.roll",
    target: { type: "selected-track-parameter", parameter: "gain" },
    transform: { inputMin: 0.15, inputMax: 0.85, outputMin: 0.2, outputMax: 1.15, curve: "s", invert: false, smoothing: 0.84, deadZone: 0.04 },
    enabled: true
  },
  {
    id: "mapping-left-pitch-tremolo-depth",
    source: "left.rotation.pitch",
    target: { type: "selected-track-parameter", parameter: "tremolo.depth" },
    transform: { inputMin: 0.2, inputMax: 0.8, outputMin: 0, outputMax: 1, curve: "s", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "mapping-left-yaw-tremolo-rate",
    source: "left.rotation.yaw",
    target: { type: "selected-track-parameter", parameter: "tremolo.rate" },
    transform: { inputMin: 0.2, inputMax: 0.8, outputMin: 0.2, outputMax: 18, curve: "exp", invert: false, smoothing: 0.84 },
    enabled: true
  },
  {
    id: "mapping-left-openness-freeze",
    source: "left.openness",
    target: { type: "selected-track-parameter", parameter: "freeze.feedback" },
    transform: { inputMin: 0.2, inputMax: 0.9, outputMin: 0, outputMax: 0.96, curve: "s", invert: true, smoothing: 0.86 },
    enabled: true
  },
  {
    id: "mapping-stutter-toggle",
    source: "left.palmFacing",
    target: { type: "selected-track-toggle", parameter: "stutter.enabled", gate: { onThreshold: 0.68, offThreshold: 0.38 } },
    transform: { inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1, curve: "s", invert: true, smoothing: 0.72 },
    enabled: true
  },
  {
    id: "mapping-reverse-toggle",
    source: "right.palmFacing",
    target: { type: "selected-track-toggle", parameter: "reverse.enabled", gate: { onThreshold: 0.68, offThreshold: 0.38 } },
    transform: { inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1, curve: "s", invert: true, smoothing: 0.72 },
    enabled: true
  },
  {
    id: "mapping-resynthesis",
    source: "hands.distance",
    target: { type: "selected-track-parameter", parameter: "resynthesis.mix" },
    transform: { inputMin: 0.08, inputMax: 0.72, outputMin: 0, outputMax: 1, curve: "s", invert: false, smoothing: 0.82 },
    enabled: true
  }
];

type GestureSignalProfile = "finger" | "classic" | "both";

const GESTURE_SIGNAL_DISPLAY: ReadonlyArray<{ feature: GestureFeatureName; label: string; profile: GestureSignalProfile }> = [
  { feature: "left.thumb.flexion", label: "L thumb / delay", profile: "finger" },
  { feature: "left.index.flexion", label: "L index / stutter", profile: "finger" },
  { feature: "left.middle.flexion", label: "L middle / reverse", profile: "finger" },
  { feature: "left.ring.flexion", label: "L ring / saturation", profile: "finger" },
  { feature: "left.pinky.flexion", label: "L pinky / bits", profile: "finger" },
  { feature: "left.rotation.roll", label: "L roll / gain", profile: "finger" },
  { feature: "left.rotation.pitch", label: "L pitch / trem depth", profile: "finger" },
  { feature: "left.rotation.yaw", label: "L yaw / trem rate", profile: "finger" },
  { feature: "left.palmFacing", label: "L palm / stutter gate", profile: "finger" },
  { feature: "right.thumb.flexion", label: "R thumb / feedback", profile: "finger" },
  { feature: "right.index.flexion", label: "R index / low-pass", profile: "finger" },
  { feature: "right.middle.flexion", label: "R middle / resonance", profile: "finger" },
  { feature: "right.ring.flexion", label: "R ring / delay mix", profile: "finger" },
  { feature: "right.pinky.flexion", label: "R pinky / reverb", profile: "finger" },
  { feature: "right.rotation.roll", label: "R roll / pan", profile: "finger" },
  { feature: "right.rotation.pitch", label: "R pitch / high-pass", profile: "finger" },
  { feature: "right.palmFacing", label: "R palm / reverse gate", profile: "finger" },
  { feature: "left.x", label: "L horizontal / track", profile: "classic" },
  { feature: "left.y", label: "L vertical / gain", profile: "classic" },
  { feature: "left.z", label: "L depth / feedback", profile: "classic" },
  { feature: "left.openness", label: "L openness / freeze", profile: "classic" },
  { feature: "left.velocity.x", label: "L movement X / stutter rate", profile: "classic" },
  { feature: "left.velocity.y", label: "L movement Y / reverse rate", profile: "classic" },
  { feature: "right.x", label: "R horizontal / pan", profile: "classic" },
  { feature: "right.y", label: "R vertical / low-pass", profile: "classic" },
  { feature: "right.pinch", label: "R pinch / resonance", profile: "classic" },
  { feature: "right.openness", label: "R openness / reverb", profile: "classic" },
  { feature: "right.velocity.x", label: "R movement X / saturation", profile: "classic" },
  { feature: "right.velocity.y", label: "R movement Y / tremolo", profile: "classic" },
  { feature: "hands.angle", label: "Hand angle / delay", profile: "classic" },
  { feature: "right.rotation.yaw", label: "R yaw / filter rate", profile: "both" },
  { feature: "right.z", label: "Camera / filter depth", profile: "both" },
  { feature: "hands.distance", label: "Hands / source-synth", profile: "both" }
];

const HOTKEY_ACTIONS: ReadonlyArray<{ code: string; key: string; label: string; note?: string }> = [
  { code: "Space", key: "Space", label: "Play / pause" },
  { code: "ArrowLeft", key: "← / ↑", label: "Previous track", note: "when arrow selection is enabled" },
  { code: "ArrowRight", key: "→ / ↓", label: "Next track", note: "when arrow selection is enabled" },
  { code: "KeyM", key: "M", label: "Mute selected track" },
  { code: "KeyI", key: "I", label: "Isolate / solo selected track" },
  { code: "KeyL", key: "L", label: "Toggle loop" },
  { code: "KeyS", key: "S", label: "Toggle Stutter" },
  { code: "KeyR", key: "R", label: "Toggle Reverse" },
  { code: "KeyC", key: "C", label: "Capture scene" },
  { code: "KeyN", key: "N", label: "Next scene" },
  { code: "KeyF", key: "F", label: "Camera fullscreen" }
];

const configuredProcessorUrl: unknown = (import.meta.env as Record<string, unknown>)["VITE_PROCESSOR_URL"];
const PROCESSOR_URL = typeof configuredProcessorUrl === "string"
  ? configuredProcessorUrl
  : "http://127.0.0.1:8766";

const inferRole = (filename: string): TrackRole => {
  const normalized = filename.toLowerCase();
  if (normalized.includes("drum")) return "drums";
  if (normalized.includes("bass")) return "bass";
  if (normalized.includes("melod")) return "melody";
  if (normalized.includes("vocal")) return "vocals";
  if (normalized.includes("instrument")) return "other";
  return "custom";
};

const roleLabel = (role: TrackRole): string => role === "other" ? "other / instruments" : role;

type NumericTrackParameter =
  | "gain"
  | "pan"
  | "highpassCutoff"
  | "filterCutoff"
  | "filterResonance"
  | "filterModDepth"
  | "filterModRate"
  | "delayTime"
  | "delayFeedback"
  | "delayMix"
  | "reverbMix"
  | "saturation"
  | "bitDepth"
  | "tremoloDepth"
  | "tremoloRate"
  | "freezeFeedback"
  | "stutterSeconds"
  | "reverseRate";

export class Workstation {
  readonly #store = new ProjectStore();
  readonly #audio = new TrackAudioEngine();
  readonly #transport = new ProjectTransport(this.#audio.context);
  readonly #mappingEngine = new GestureMappingEngine();
  readonly #processor = new ProcessorClient(PROCESSOR_URL);
  readonly #midi = new WebMidiOutput();
  readonly #trackSelection = new TrackSelectionStabilizer();
  readonly #waveforms = new Map<string, WaveformView>();
  #gestureSource: GestureSource | undefined;
  #gestureUnsubscribe: (() => void) | undefined;
  #lastGestureWrite = 0;
  #recording = false;
  #transcriptionAvailable = false;
  #automationRecording = false;
  #lastAutomationPoint = new Map<string, number>();
  #learnTarget: GestureContinuousParameter | undefined;
  #learnStarted = 0;
  #learnRanges = new Map<string, { min: number; max: number }>();
  #effectVisualizer: QuarksEffectVisualizer | undefined;
  #lastGestureFrame: GestureFrame | undefined;
  #workspaceSettings = loadWorkspaceSettings();

  constructor() {
    this.#transport.configureAudioCallbacks(
      (offset) => this.#audio.schedule(offset),
      () => this.#audio.stopSources()
    );
    this.#store.update((project) => { project.mappings = structuredClone(FINGER_MAPPINGS); });
    this.#syncActiveGestureMappings();
  }

  mount(root: HTMLElement): void {
    this.#applyWorkspaceSettings();
    root.innerHTML = this.#template();
    this.#syncWorkspaceSettingsControls();
    void this.#setupEffectVisualizer();
    this.#bindActions();
    this.#transport.subscribe((snapshot) => {
      setText("#transportTime", `${formatTime(snapshot.currentSeconds)} / ${formatTime(snapshot.durationSeconds)}`);
      const scrub = queryRequired<HTMLInputElement>("#transportScrub");
      scrub.max = String(Math.max(0.01, snapshot.durationSeconds));
      scrub.value = String(snapshot.currentSeconds);
      const playButton = queryRequired<HTMLButtonElement>("#playButton");
      const playing = snapshot.state === "playing";
      playButton.textContent = playing ? "Ⅱ" : "▶";
      playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
      playButton.title = playing ? "Pause (Space)" : "Play (Space)";
      for (const waveform of this.#waveforms.values()) waveform.setTime(snapshot.currentSeconds);
      if (snapshot.state === "playing" && !this.#automationRecording) this.#playAutomation(snapshot.currentSeconds);
    });
    this.#renderTracks();
    this.#syncInspector();
    void this.#checkProcessor();
  }

  async #setupEffectVisualizer(): Promise<void> {
    const effectCanvas = queryRequired<HTMLCanvasElement>("#effectCanvas");
    try {
      const { QuarksEffectVisualizer } = await import("../visualization/effect-visualizer");
      this.#effectVisualizer = new QuarksEffectVisualizer(effectCanvas);
    } catch {
      effectCanvas.hidden = true;
      this.#setStatus("WebGL effects unavailable — audio and gesture control remain active", true);
    }
  }

  #applyWorkspaceSettings(): void {
    applyWorkspaceSettings(this.#workspaceSettings);
  }

  #updateWorkspaceSettings(update: Partial<WorkspaceSettings>): void {
    this.#workspaceSettings = parseWorkspaceSettings({ ...this.#workspaceSettings, ...update });
    this.#applyWorkspaceSettings();
    this.#syncWorkspaceSettingsControls();
    this.#setSettingsPersistenceStatus(saveWorkspaceSettings(this.#workspaceSettings));
  }

  #syncActiveGestureMappings(): void {
    this.#mappingEngine.setMappings(mappingsForGestureMode(
      this.#workspaceSettings.gestureControlMode,
      this.#store.snapshot.mappings
    ));
  }

  #setGestureControlMode(mode: GestureControlMode): void {
    if (mode === this.#workspaceSettings.gestureControlMode) return;
    this.#updateWorkspaceSettings({ gestureControlMode: mode });
    this.#syncActiveGestureMappings();
    this.#learnTarget = undefined;
    this.#learnRanges.clear();
    const label = mode === "classic" ? "Classic hands" : "Finger detail";
    setText("#learnStatus", `${label} profile active. Gesture Learn uses only signals from this profile.`);
    this.#setStatus(`${label} gesture profile active.`);
  }

  #setSettingsPersistenceStatus(saved: boolean): void {
    const status = document.querySelector<HTMLElement>("#settingsPersistenceStatus");
    if (!status) return;
    status.textContent = saved
      ? "Applied now · saved on this device"
      : "Applied now · browser storage unavailable";
    status.classList.toggle("is-storage-warning", !saved);
  }

  #syncWorkspaceSettingsControls(): void {
    const themeButton = document.querySelector<HTMLButtonElement>("#themeButton");
    if (!themeButton) return;
    const { theme, signalColor, density, inspectorWidth, hudPosition, signalPanelOpen, gestureControlMode, hotkeysEnabled, hotkeyModifier } = this.#workspaceSettings;
    themeButton.setAttribute("aria-pressed", String(theme === "light"));
    themeButton.textContent = theme === "light" ? "Dark theme" : "Invert theme";
    queryRequired<HTMLInputElement>("#signalColor").value = signalColor;
    queryRequired<HTMLOutputElement>("#signalColorValue").value = signalColor;
    queryRequired<HTMLInputElement>("#settingsSignalPanelOpen").checked = signalPanelOpen;
    queryRequired<HTMLDetailsElement>(".gesture-signal-panel").open = signalPanelOpen;
    const pressedOptions: Array<[string, string]> = [
      ["workspaceTheme", theme],
      ["workspaceDensity", density],
      ["workspaceInspectorWidth", inspectorWidth],
      ["workspaceHudPosition", hudPosition],
      ["hotkeyModifier", hotkeyModifier]
    ];
    for (const [dataKey, selectedValue] of pressedOptions) {
      for (const option of document.querySelectorAll<HTMLButtonElement>(`[data-${dataKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`)) {
        option.setAttribute("aria-pressed", String(option.dataset[dataKey] === selectedValue));
      }
    }
    for (const preset of document.querySelectorAll<HTMLButtonElement>("[data-signal-color]")) {
      preset.setAttribute("aria-pressed", String(preset.dataset.signalColor === signalColor));
    }
    for (const option of document.querySelectorAll<HTMLButtonElement>("[data-gesture-control-mode]")) {
      option.setAttribute("aria-pressed", String(option.dataset.gestureControlMode === gestureControlMode));
    }
    setText("#gestureProfileDescription", gestureControlMode === "classic"
      ? "Classic hands ignores individual fingers and maps whole-hand position, distance, openness, velocity and rotation."
      : "Finger detail maps individual finger flexion plus whole-hand rotation, depth and distance.");
    setText("#gestureSignalSummary", gestureControlMode === "classic" ? "Classic hand signals" : "Finger + orientation signals");
    setText("#gestureSignalLegend", gestureControlMode === "classic"
      ? "Normalized / whole-hand position, openness, movement, rotation and distance 0–100 · individual fingers ignored"
      : "Normalized / flexion 0 open–100 flexed · palm 0 back–100 front · rotation and depth 0–100");
    setText("#gesturePresetDescription", gestureControlMode === "classic"
      ? "Classic preset / left hand selects context and controls time · right hand shapes filters and space · fingers are ignored"
      : "Finger preset / right fingers shape filters and space · left fingers shape time and texture · palm backs gate stutter and reverse · both hand rotations drive modulators");
    queryRequired<HTMLInputElement>("#hotkeysEnabled").checked = hotkeysEnabled;
    for (const key of document.querySelectorAll<HTMLElement>("[data-hotkey-key]")) {
      const base = key.dataset.hotkeyKey ?? "";
      key.textContent = `${hotkeyModifier === "shift" ? "⇧ + " : ""}${base}`;
    }
    setText("#hotkeyState", hotkeysEnabled
      ? `Enabled · ${hotkeyModifier === "shift" ? "Shift modifier required" : "direct keys"}`
      : "Disabled · interface controls remain available");
  }

  #selectSettingsTab(tab: "appearance" | "layout" | "hotkeys", focus = false): void {
    const tabs = [
      ["appearance", "#appearanceTab", "#appearanceSettings"],
      ["layout", "#layoutTab", "#layoutSettings"],
      ["hotkeys", "#hotkeysTab", "#hotkeySettings"]
    ] as const;
    for (const [name, tabSelector, paneSelector] of tabs) {
      const active = name === tab;
      const button = queryRequired<HTMLButtonElement>(tabSelector);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      queryRequired<HTMLElement>(paneSelector).hidden = !active;
      if (active && focus) button.focus();
    }
  }

  #bindWorkspaceSettings(): void {
    const dialog = queryRequired<HTMLDialogElement>("#settingsDialog");
    queryRequired<HTMLButtonElement>("#settingsButton").addEventListener("click", () => {
      this.#selectSettingsTab("appearance");
      dialog.showModal();
      queryRequired<HTMLButtonElement>("#appearanceTab").focus();
    });
    queryRequired<HTMLButtonElement>("#settingsCloseButton").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dialog.close();
    });

    const appearanceTab = queryRequired<HTMLButtonElement>("#appearanceTab");
    const layoutTab = queryRequired<HTMLButtonElement>("#layoutTab");
    const hotkeysTab = queryRequired<HTMLButtonElement>("#hotkeysTab");
    appearanceTab.addEventListener("click", () => this.#selectSettingsTab("appearance"));
    layoutTab.addEventListener("click", () => this.#selectSettingsTab("layout"));
    hotkeysTab.addEventListener("click", () => this.#selectSettingsTab("hotkeys"));
    const settingsTabs = [appearanceTab, layoutTab, hotkeysTab];
    for (const [index, tab] of settingsTabs.entries()) {
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const offset = event.key === "ArrowLeft" ? -1 : 1;
        const nextIndex = (index + offset + settingsTabs.length) % settingsTabs.length;
        this.#selectSettingsTab((["appearance", "layout", "hotkeys"] as const)[nextIndex] ?? "appearance", true);
      });
    }

    for (const option of document.querySelectorAll<HTMLButtonElement>("[data-workspace-theme]")) {
      option.addEventListener("click", () => {
        const theme = option.dataset.workspaceTheme as WorkspaceSettings["theme"] | undefined;
        if (theme) this.#updateWorkspaceSettings({ theme });
      });
    }
    queryRequired<HTMLInputElement>("#signalColor").addEventListener("input", (event) => {
      this.#updateWorkspaceSettings({ signalColor: (event.currentTarget as HTMLInputElement).value });
    });
    for (const preset of document.querySelectorAll<HTMLButtonElement>("[data-signal-color]")) {
      preset.addEventListener("click", () => {
        const signalColor = preset.dataset.signalColor;
        if (signalColor) this.#updateWorkspaceSettings({ signalColor });
      });
    }
    for (const option of document.querySelectorAll<HTMLButtonElement>("[data-workspace-density]")) {
      option.addEventListener("click", () => {
        const density = option.dataset.workspaceDensity as WorkspaceSettings["density"] | undefined;
        if (density) this.#updateWorkspaceSettings({ density });
      });
    }
    for (const option of document.querySelectorAll<HTMLButtonElement>("[data-workspace-inspector-width]")) {
      option.addEventListener("click", () => {
        const inspectorWidth = option.dataset.workspaceInspectorWidth as WorkspaceSettings["inspectorWidth"] | undefined;
        if (inspectorWidth) this.#updateWorkspaceSettings({ inspectorWidth });
      });
    }
    for (const option of document.querySelectorAll<HTMLButtonElement>("[data-workspace-hud-position]")) {
      option.addEventListener("click", () => {
        const hudPosition = option.dataset.workspaceHudPosition as WorkspaceSettings["hudPosition"] | undefined;
        if (hudPosition) this.#updateWorkspaceSettings({ hudPosition });
      });
    }
    queryRequired<HTMLInputElement>("#settingsSignalPanelOpen").addEventListener("change", (event) => {
      this.#updateWorkspaceSettings({ signalPanelOpen: (event.currentTarget as HTMLInputElement).checked });
    });
    queryRequired<HTMLInputElement>("#hotkeysEnabled").addEventListener("change", (event) => {
      this.#updateWorkspaceSettings({ hotkeysEnabled: (event.currentTarget as HTMLInputElement).checked });
    });
    for (const option of document.querySelectorAll<HTMLButtonElement>("[data-hotkey-modifier]")) {
      option.addEventListener("click", () => {
        const hotkeyModifier = option.dataset.hotkeyModifier as WorkspaceSettings["hotkeyModifier"] | undefined;
        if (hotkeyModifier) this.#updateWorkspaceSettings({ hotkeyModifier });
      });
    }
    queryRequired<HTMLDetailsElement>(".gesture-signal-panel").addEventListener("toggle", (event) => {
      const open = (event.currentTarget as HTMLDetailsElement).open;
      if (open !== this.#workspaceSettings.signalPanelOpen) this.#updateWorkspaceSettings({ signalPanelOpen: open });
    });
    queryRequired<HTMLButtonElement>("#settingsResetButton").addEventListener("click", () => {
      this.#workspaceSettings = { ...DEFAULT_WORKSPACE_SETTINGS };
      this.#applyWorkspaceSettings();
      this.#syncWorkspaceSettingsControls();
      this.#setSettingsPersistenceStatus(saveWorkspaceSettings(this.#workspaceSettings));
      this.#setStatus("Workspace settings reset to defaults.");
    });
  }

  #template(): string {
    return `
      <main class="app-shell">
        <header class="app-header">
          <div class="brand-block">
            <h1>Gesture Stem Workstation</h1>
          </div>
          <div class="header-actions" aria-label="Project actions">
            <button id="demoButton" type="button">Add example stems</button>
            <label class="file-button secondary">Add stems<input id="audioInput" type="file" accept="audio/*,.wav,.flac,.mp3,.m4a" multiple /></label>
            <button id="clearTracksButton" class="secondary" type="button" disabled>Clear track list</button>
            <button id="saveButton" class="secondary" type="button">Save project</button>
            <label class="file-button secondary">Load project<input id="projectInput" type="file" accept="application/json,.json" /></label>
            <button id="themeButton" class="secondary" type="button" aria-pressed="false">Invert theme</button>
            <button id="settingsButton" class="secondary" type="button" aria-haspopup="dialog">Settings</button>
          </div>
        </header>

        <section class="transport" aria-label="Authoritative transport">
          <div class="transport-actions">
            <button id="playButton" class="transport-icon-button" type="button" aria-label="Play" title="Play (Space)" disabled>▶</button>
            <button id="stopButton" class="transport-icon-button secondary" type="button" aria-label="Stop" title="Stop" disabled>■</button>
            <button id="recordButton" class="transport-icon-button secondary" type="button" aria-label="Record mix" title="Record mix" disabled>●</button>
            <button id="automationButton" class="transport-icon-button secondary" type="button" aria-label="Record gestures" title="Record gestures" disabled>◉</button>
            <button id="saveSceneButton" class="transport-icon-button secondary" type="button" aria-label="Capture scene" title="Capture scene" disabled>＋</button>
            <button id="nextSceneButton" class="transport-icon-button secondary" type="button" aria-label="Next scene" title="Next scene" disabled>→</button>
          </div>
          <div id="transportTime" class="transport-time">00:00.0 / 00:00.0</div>
          <input id="transportScrub" class="transport-scrub" type="range" min="0" max="0.01" value="0" step="0.01" aria-label="Transport position" />
          <div class="loop-controls">
            <label><input id="loopEnabled" type="checkbox" /> <span>Loop</span></label>
            <label><span>In</span><input id="loopStart" type="number" min="0" step="0.1" value="0" /></label>
            <label><span>Out</span><input id="loopEnd" type="number" min="0.1" step="0.1" value="16" /></label>
          </div>
        </section>

        <div class="workspace">
          <section aria-labelledby="tracksHeading">
            <div class="section-heading">
              <h2 id="tracksHeading">Tracks</h2>
              <span id="trackCount" class="meta">0 tracks</span>
            </div>
            <div id="tracks" class="tracks"></div>
          </section>

          <div class="performance-grid">
            <section class="instrument-panel" aria-labelledby="inspectorHeading">
              <header class="panel-header">
                <p class="meta">Selected track</p>
                <h2 id="inspectorHeading">No track selected</h2>
              </header>
              <div class="panel-body">
                <label class="setting-line"><input id="arrowSelectionEnabled" type="checkbox" /> <span>Select tracks with arrow keys</span></label>
                <p class="meta">← / ↑ previous track · → / ↓ next track</p>
                <div class="divider"></div>
                <p class="meta">Mix + filters</p>
                <label class="control-line"><span>Gain</span><input id="gainControl" type="range" min="0" max="1.25" step="0.01" disabled /><output id="gainValue" class="control-value">—</output></label>
                <label class="control-line"><span>Pan</span><input id="panControl" type="range" min="-1" max="1" step="0.01" disabled /><output id="panValue" class="control-value">—</output></label>
                <label class="control-line"><span>High-pass</span><input id="highpassControl" type="range" min="20" max="8000" step="1" disabled /><output id="highpassValue" class="control-value">—</output></label>
                <label class="control-line"><span>Low-pass</span><input id="cutoffControl" type="range" min="80" max="20000" step="1" disabled /><output id="cutoffValue" class="control-value">—</output></label>
                <label class="control-line"><span>Resonance</span><input id="resonanceControl" type="range" min="0.1" max="18" step="0.1" disabled /><output id="resonanceValue" class="control-value">—</output></label>
                <label class="control-line"><span>Filter modulation</span><input id="filterModDepthControl" type="range" min="0" max="1" step="0.01" disabled /><output id="filterModDepthValue" class="control-value">—</output></label>
                <label class="control-line"><span>Filter mod rate</span><input id="filterModRateControl" type="range" min="0.05" max="12" step="0.05" disabled /><output id="filterModRateValue" class="control-value">—</output></label>
                <div class="divider"></div>
                <p class="meta">Delay + space</p>
                <label class="control-line"><span>Delay time</span><input id="delayTimeControl" type="range" min="0.02" max="1.2" step="0.01" disabled /><output id="delayTimeValue" class="control-value">—</output></label>
                <label class="control-line"><span>Feedback</span><input id="delayFeedbackControl" type="range" min="0" max="0.85" step="0.01" disabled /><output id="delayFeedbackValue" class="control-value">—</output></label>
                <label class="control-line"><span>Delay mix</span><input id="delayMixControl" type="range" min="0" max="0.8" step="0.01" disabled /><output id="delayMixValue" class="control-value">—</output></label>
                <label class="control-line"><span>Reverb mix</span><input id="reverbMixControl" type="range" min="0" max="0.8" step="0.01" disabled /><output id="reverbMixValue" class="control-value">—</output></label>
                <div class="divider"></div>
                <p class="meta">Experimental processors</p>
                <div class="quick-effect-controls" aria-label="Quick experimental effect switches">
                  <button id="stutterQuickButton" class="quick-effect-button secondary" type="button" aria-pressed="false" disabled><kbd data-hotkey-key="S">S</kbd><span>Stutter</span></button>
                  <button id="reverseQuickButton" class="quick-effect-button secondary" type="button" aria-pressed="false" disabled><kbd data-hotkey-key="R">R</kbd><span>Reverse</span></button>
                </div>
                <p class="meta">Quick toggle: S for Stutter · R for Reverse</p>
                <label class="control-line"><span>Saturation</span><input id="saturationControl" type="range" min="0" max="1" step="0.01" disabled /><output id="saturationValue" class="control-value">—</output></label>
                <label class="control-line"><span>Bit depth</span><input id="bitDepthControl" type="range" min="2" max="16" step="1" disabled /><output id="bitDepthValue" class="control-value">—</output></label>
                <label class="control-line"><span>Tremolo depth</span><input id="tremoloDepthControl" type="range" min="0" max="1" step="0.01" disabled /><output id="tremoloDepthValue" class="control-value">—</output></label>
                <label class="control-line"><span>Tremolo rate</span><input id="tremoloRateControl" type="range" min="0.2" max="18" step="0.1" disabled /><output id="tremoloRateValue" class="control-value">—</output></label>
                <label class="control-line"><span>Feedback freeze</span><input id="freezeControl" type="range" min="0" max="0.96" step="0.01" disabled /><output id="freezeValue" class="control-value">—</output></label>
                <label class="setting-line"><input id="stutterEnabled" type="checkbox" disabled /> <span>Stutter selected track</span></label>
                <label class="setting-line"><input id="reverseEnabled" type="checkbox" disabled /> <span>Reverse selected track</span></label>
                <label class="control-line"><span>Stutter length</span><input id="stutterSize" type="range" min="0.03125" max="0.5" step="0.001" disabled /><output id="stutterSizeValue" class="control-value">—</output></label>
                <label class="control-line"><span>Reverse speed</span><input id="reverseRateControl" type="range" min="0.5" max="2" step="0.01" disabled /><output id="reverseRateValue" class="control-value">—</output></label>
                <p class="meta">Experimental processors are local and non-destructive. Stutter takes effect immediately during playback.</p>
                <div class="divider"></div>
                <p class="meta">Transcription + resynthesis</p>
                <div class="gesture-actions"><button id="transcribeButton" class="secondary" type="button" disabled>Transcribe selected track</button><button id="midiExportButton" class="secondary" type="button" disabled>Export MIDI</button></div>
                <p id="transcriptionStatus" class="meta">No note analysis</p>
                <label class="setting-line"><input id="synthEnabled" type="checkbox" disabled /> <span>Enable synthesizer path</span></label>
                <label class="control-line"><span>Source ↔ synth</span><input id="synthMixControl" type="range" min="0" max="1" step="0.01" disabled /><output id="synthMixValue" class="control-value">—</output></label>
                <label class="control-line"><span>Oscillator</span><select id="oscillatorControl" disabled><option value="sine">Sine</option><option value="triangle">Triangle</option><option value="sawtooth">Sawtooth</option><option value="square">Square</option></select><output class="control-value">OSC</output></label>
                <label class="control-line"><span>Attack</span><input id="attackControl" type="range" min="0.002" max="1" step="0.002" disabled /><output id="attackValue" class="control-value">—</output></label>
                <label class="control-line"><span>Release</span><input id="releaseControl" type="range" min="0.01" max="2" step="0.01" disabled /><output id="releaseValue" class="control-value">—</output></label>
                <div class="divider"></div>
                <p class="meta">External MIDI</p>
                <div class="gesture-actions"><button id="midiButton" class="secondary" type="button">Enable MIDI</button><select id="midiOutput" disabled><option value="">No output</option></select></div>
                <p id="midiStatus" class="meta">Mapped effects are sent as MIDI CC when enabled.</p>
                <div class="divider"></div>
                <p class="meta">Gesture learn</p>
                <div class="gesture-actions"><select id="learnTarget"><option value="filter.cutoff">Low-pass</option><option value="filter.resonance">Resonance</option><option value="filter.modDepth">Filter modulation</option><option value="filter.modRate">Filter mod rate</option><option value="delay.feedback">Delay feedback</option><option value="delay.mix">Delay mix</option><option value="reverb.mix">Reverb mix</option><option value="stutter.seconds">Stutter length</option><option value="reverse.rate">Reverse speed</option><option value="resynthesis.mix">Source ↔ synth</option></select><button id="learnButton" class="secondary" type="button">Learn gesture</button></div>
                <p id="learnStatus" class="meta">Move a control after starting learn mode.</p>
                <div class="divider"></div>
                <p id="gesturePresetDescription" class="meta">Finger preset / right fingers shape filters and space · left fingers shape time and texture · palm backs gate stutter and reverse · both hand rotations drive modulators</p>
              </div>
            </section>

            <section class="instrument-panel" aria-labelledby="gestureHeading">
              <header class="panel-header gesture-panel-header">
                <div>
                  <p class="meta">Local camera inference</p>
                  <h2 id="gestureHeading">Gesture control</h2>
                </div>
                <div class="gesture-mode-switch" aria-label="Gesture control detail">
                  <button class="gesture-mode-button secondary" type="button" data-gesture-control-mode="finger" aria-pressed="true">Finger detail</button>
                  <button class="gesture-mode-button secondary" type="button" data-gesture-control-mode="classic" aria-pressed="false">Classic hands</button>
                </div>
              </header>
              <p id="gestureProfileDescription" class="gesture-profile-description">Finger detail maps individual finger flexion plus whole-hand rotation, depth and distance.</p>
              <div class="camera-stage">
                <video id="cameraVideo" playsinline muted></video>
                <canvas id="effectCanvas" class="effect-canvas"></canvas>
                <canvas id="cameraCanvas"></canvas>
                <div class="performance-hud" aria-live="polite">
                  <span class="hud-kicker">Live signal</span>
                  <strong id="hudTrack">No track</strong>
                  <span id="hudEffects">LP — · DLY — · REV —</span>
                  <span id="hudDepth">Depth —</span>
                </div>
                <button id="fullscreenButton" class="camera-fullscreen-button" type="button" aria-pressed="false">Fullscreen</button>
                <div class="signal-grid" aria-hidden="true">
                  <div id="trackZones" class="track-zones"></div>
                  <div id="signalPoint" class="signal-point" hidden></div>
                </div>
              </div>
              <div class="gesture-status">
                <div class="mapping-readout">
                  <span id="gestureMode" class="meta">Input inactive</span>
                  <strong id="gestureReadout">Awaiting hand signal</strong>
                </div>
                <div class="depth-readout"><span id="depthReadout" class="meta">Distance —</span><span id="gestureLatency" class="meta">— ms</span></div>
              </div>
              <details class="gesture-signal-panel" open>
                <summary id="gestureSignalSummary">Finger + orientation signals</summary>
                <p id="gestureSignalLegend" class="gesture-signal-legend">Normalized / flexion 0 open–100 flexed · palm 0 back–100 front · rotation and depth 0–100</p>
                <div class="gesture-signal-grid">
                  ${GESTURE_SIGNAL_DISPLAY.map(({ feature, label, profile }) => `<div class="gesture-signal" data-gesture-feature="${feature}" data-gesture-profile="${profile}"><span>${label}</span><span class="gesture-signal-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="gesture-signal-fill"></span></span><output>—</output></div>`).join("")}
                </div>
              </details>
              <div class="panel-body">
                <div class="gesture-actions">
                  <button id="cameraButton" type="button">Enable camera</button>
                  <button id="syntheticButton" class="secondary" type="button">Test without camera</button>
                  <button id="gestureStopButton" class="secondary" type="button" disabled>Disable</button>
                </div>
                <label><input id="mirrorCamera" type="checkbox" checked /> <span>Mirror camera</span></label>
                <p class="meta">Camera frames are never uploaded or stored. MediaPipe inference runs in this browser.</p>
              </div>
            </section>
          </div>
        </div>

        <footer class="status-bar">
          <span id="statusMessage">Ready — add example stems or audio</span>
          <span id="processorStatus" class="status-dot">Processor offline</span>
        </footer>

        <dialog id="settingsDialog" class="settings-dialog" aria-labelledby="settingsHeading">
          <header class="settings-header">
            <div>
              <p class="meta">Device preferences</p>
              <h2 id="settingsHeading">Workspace settings</h2>
            </div>
            <button id="settingsCloseButton" class="secondary compact-button" type="button" aria-label="Close settings">Close</button>
          </header>
          <div class="settings-tabs" role="tablist" aria-label="Settings categories">
            <button id="appearanceTab" class="settings-tab secondary" type="button" role="tab" aria-selected="true" aria-controls="appearanceSettings">Appearance</button>
            <button id="layoutTab" class="settings-tab secondary" type="button" role="tab" aria-selected="false" aria-controls="layoutSettings" tabindex="-1">Layout</button>
            <button id="hotkeysTab" class="settings-tab secondary" type="button" role="tab" aria-selected="false" aria-controls="hotkeySettings" tabindex="-1">Hotkeys</button>
          </div>
          <section id="appearanceSettings" class="settings-pane" role="tabpanel" aria-labelledby="appearanceTab">
            <div class="settings-field">
              <span class="settings-label">Theme</span>
              <div class="settings-option-group two-options" aria-label="Theme">
                <button class="settings-option secondary" type="button" data-workspace-theme="dark" aria-pressed="true">Dark</button>
                <button class="settings-option secondary" type="button" data-workspace-theme="light" aria-pressed="false">Light</button>
              </div>
              <p class="settings-help">Changes surfaces only. The interface keeps exactly two contrast-safe themes.</p>
            </div>
            <div class="settings-field">
              <label for="signalColor"><span>Accent / signal color</span></label>
              <div class="color-control">
                <input id="signalColor" type="color" value="#00e5ff" aria-describedby="signalColorHelp" />
                <output id="signalColorValue" for="signalColor">#00e5ff</output>
              </div>
              <div class="color-presets" aria-label="Signal color presets">
                <button class="color-preset" type="button" data-signal-color="#00e5ff" style="--preset-color: #00e5ff" aria-label="Cyan signal color"></button>
                <button class="color-preset" type="button" data-signal-color="#ff4d8d" style="--preset-color: #ff4d8d" aria-label="Pink signal color"></button>
                <button class="color-preset" type="button" data-signal-color="#ffb000" style="--preset-color: #ffb000" aria-label="Amber signal color"></button>
                <button class="color-preset" type="button" data-signal-color="#63e66f" style="--preset-color: #63e66f" aria-label="Green signal color"></button>
              </div>
              <p id="signalColorHelp" class="settings-help">Used for hand points, active stems, live meters and particle effects. Low-contrast colors are corrected automatically.</p>
            </div>
          </section>
          <section id="layoutSettings" class="settings-pane" role="tabpanel" aria-labelledby="layoutTab" hidden>
            <div class="settings-field">
              <span class="settings-label">Spacing density</span>
              <div class="settings-option-group three-options" aria-label="Spacing density">
                <button class="settings-option secondary" type="button" data-workspace-density="compact" aria-pressed="false">Compact</button>
                <button class="settings-option secondary" type="button" data-workspace-density="standard" aria-pressed="true">Standard</button>
                <button class="settings-option secondary" type="button" data-workspace-density="spacious" aria-pressed="false">Spacious</button>
              </div>
              <p class="settings-help">Adjusts panel padding and workspace gaps without moving or reordering controls.</p>
            </div>
            <div class="settings-field">
              <span class="settings-label">Control panel width</span>
              <div class="settings-option-group three-options" aria-label="Control panel width">
                <button class="settings-option secondary" type="button" data-workspace-inspector-width="narrow" aria-pressed="false">Narrow</button>
                <button class="settings-option secondary" type="button" data-workspace-inspector-width="standard" aria-pressed="true">Standard</button>
                <button class="settings-option secondary" type="button" data-workspace-inspector-width="wide" aria-pressed="false">Wide</button>
              </div>
            </div>
            <div class="settings-field">
              <span class="settings-label">Camera HUD position</span>
              <div class="settings-option-group two-options" aria-label="Camera HUD position">
                <button class="settings-option secondary" type="button" data-workspace-hud-position="left" aria-pressed="true">Left</button>
                <button class="settings-option secondary" type="button" data-workspace-hud-position="right" aria-pressed="false">Right</button>
              </div>
            </div>
            <label class="setting-line settings-field-inline"><input id="settingsSignalPanelOpen" type="checkbox" /> <span>Open gesture signal matrix by default</span></label>
          </section>
          <section id="hotkeySettings" class="settings-pane hotkey-settings-pane" role="tabpanel" aria-labelledby="hotkeysTab" hidden>
            <label class="setting-line settings-field-inline"><input id="hotkeysEnabled" type="checkbox" checked /> <span>Enable application hotkeys</span></label>
            <div class="settings-field">
              <span class="settings-label">Activation</span>
              <div class="settings-option-group two-options" aria-label="Hotkey activation modifier">
                <button class="settings-option secondary" type="button" data-hotkey-modifier="none" aria-pressed="true">Direct keys</button>
                <button class="settings-option secondary" type="button" data-hotkey-modifier="shift" aria-pressed="false">Require Shift</button>
              </div>
              <p class="settings-help">Text fields, selects and editable content always ignore application hotkeys.</p>
            </div>
            <div class="hotkey-list" aria-label="Application hotkey list">
              ${HOTKEY_ACTIONS.map(({ key, label, note }) => `<div class="hotkey-row"><kbd data-hotkey-key="${key}">${key}</kbd><span>${label}${note ? `<small>${note}</small>` : ""}</span></div>`).join("")}
            </div>
            <p id="hotkeyState" class="settings-help hotkey-state" aria-live="polite">Enabled · direct keys</p>
          </section>
          <footer class="settings-footer">
            <p id="settingsPersistenceStatus" class="settings-application-status" aria-live="polite">Changes apply immediately · stored separately from project files</p>
            <button id="settingsResetButton" class="secondary" type="button">Reset settings</button>
          </footer>
        </dialog>
      </main>`;
  }

  #bindActions(): void {
    queryRequired<HTMLButtonElement>("#demoButton").addEventListener("click", () => { void this.#loadDemo(); });
    queryRequired<HTMLInputElement>("#audioInput").addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      void this.#importFiles(input.files).finally(() => { input.value = ""; });
    });
    queryRequired<HTMLButtonElement>("#clearTracksButton").addEventListener("click", () => this.#clearTrackList());
    queryRequired<HTMLButtonElement>("#playButton").addEventListener("click", () => {
      if (this.#transport.snapshot.state === "playing") this.#transport.pause(); else void this.#transport.play();
    });
    queryRequired<HTMLButtonElement>("#stopButton").addEventListener("click", () => this.#transport.stop());
    queryRequired<HTMLInputElement>("#transportScrub").addEventListener("input", (event) => this.#transport.seek(Number((event.currentTarget as HTMLInputElement).value)));
    queryRequired<HTMLButtonElement>("#recordButton").addEventListener("click", () => { void this.#toggleRecording(); });
    queryRequired<HTMLButtonElement>("#automationButton").addEventListener("click", () => this.#toggleAutomationRecording());
    queryRequired<HTMLButtonElement>("#saveSceneButton").addEventListener("click", () => this.#captureScene());
    queryRequired<HTMLButtonElement>("#nextSceneButton").addEventListener("click", () => this.#activateNextScene());
    queryRequired<HTMLButtonElement>("#saveButton").addEventListener("click", () => downloadText("gesture-stem-project.json", this.#store.serialize()));
    queryRequired<HTMLInputElement>("#projectInput").addEventListener("change", (event) => { void this.#loadProjectFile((event.currentTarget as HTMLInputElement).files?.[0]); });
    queryRequired<HTMLButtonElement>("#themeButton").addEventListener("click", () => {
      this.#updateWorkspaceSettings({ theme: this.#workspaceSettings.theme === "dark" ? "light" : "dark" });
    });
    this.#bindWorkspaceSettings();
    queryRequired<HTMLInputElement>("#loopEnabled").addEventListener("change", () => this.#updateLoop());
    queryRequired<HTMLInputElement>("#loopStart").addEventListener("change", () => this.#updateLoop());
    queryRequired<HTMLInputElement>("#loopEnd").addEventListener("change", () => this.#updateLoop());
    this.#bindInspectorControl("#gainControl", "gain");
    this.#bindInspectorControl("#panControl", "pan");
    this.#bindInspectorControl("#highpassControl", "highpassCutoff");
    this.#bindInspectorControl("#cutoffControl", "filterCutoff");
    this.#bindInspectorControl("#resonanceControl", "filterResonance");
    this.#bindInspectorControl("#filterModDepthControl", "filterModDepth");
    this.#bindInspectorControl("#filterModRateControl", "filterModRate");
    this.#bindInspectorControl("#delayTimeControl", "delayTime");
    this.#bindInspectorControl("#delayFeedbackControl", "delayFeedback");
    this.#bindInspectorControl("#delayMixControl", "delayMix");
    this.#bindInspectorControl("#reverbMixControl", "reverbMix");
    this.#bindInspectorControl("#saturationControl", "saturation");
    this.#bindInspectorControl("#bitDepthControl", "bitDepth");
    this.#bindInspectorControl("#tremoloDepthControl", "tremoloDepth");
    this.#bindInspectorControl("#tremoloRateControl", "tremoloRate");
    this.#bindInspectorControl("#freezeControl", "freezeFeedback");
    queryRequired<HTMLInputElement>("#stutterEnabled").addEventListener("change", (event) => {
      this.#setStutterState({ enabled: (event.currentTarget as HTMLInputElement).checked });
    });
    queryRequired<HTMLInputElement>("#reverseEnabled").addEventListener("change", (event) => {
      this.#setExperimentalToggle("reverseEnabled", (event.currentTarget as HTMLInputElement).checked);
    });
    queryRequired<HTMLButtonElement>("#stutterQuickButton").addEventListener("click", () => this.#toggleExperimentalShortcut("stutter"));
    queryRequired<HTMLButtonElement>("#reverseQuickButton").addEventListener("click", () => this.#toggleExperimentalShortcut("reverse"));
    queryRequired<HTMLInputElement>("#stutterSize").addEventListener("input", (event) => {
      this.#setStutterState({ seconds: Number((event.currentTarget as HTMLInputElement).value) });
    });
    this.#bindInspectorControl("#reverseRateControl", "reverseRate");
    queryRequired<HTMLButtonElement>("#transcribeButton").addEventListener("click", () => { void this.#transcribeSelectedTrack(); });
    queryRequired<HTMLButtonElement>("#midiExportButton").addEventListener("click", () => this.#exportSelectedMidi());
    queryRequired<HTMLInputElement>("#synthEnabled").addEventListener("change", (event) => {
      this.#setSynthState({ enabled: (event.currentTarget as HTMLInputElement).checked });
    });
    queryRequired<HTMLInputElement>("#synthMixControl").addEventListener("input", (event) => {
      this.#setSynthState({ mix: Number((event.currentTarget as HTMLInputElement).value) });
    });
    queryRequired<HTMLSelectElement>("#oscillatorControl").addEventListener("change", (event) => {
      this.#setSynthState({ oscillator: (event.currentTarget as HTMLSelectElement).value as SynthTrackState["oscillator"] });
    });
    queryRequired<HTMLInputElement>("#attackControl").addEventListener("input", (event) => {
      this.#setSynthState({ attack: Number((event.currentTarget as HTMLInputElement).value) });
    });
    queryRequired<HTMLInputElement>("#releaseControl").addEventListener("input", (event) => {
      this.#setSynthState({ release: Number((event.currentTarget as HTMLInputElement).value) });
    });
    queryRequired<HTMLButtonElement>("#learnButton").addEventListener("click", () => this.#startGestureLearn());
    queryRequired<HTMLButtonElement>("#midiButton").addEventListener("click", () => { void this.#enableMidi(); });
    queryRequired<HTMLSelectElement>("#midiOutput").addEventListener("change", (event) => {
      const outputId = (event.currentTarget as HTMLSelectElement).value;
      this.#midi.select(outputId);
      this.#store.update((project) => { project.midi = { ...project.midi, enabled: Boolean(outputId), outputId }; });
      setText("#midiStatus", outputId ? "MIDI output active." : "No MIDI output selected.");
    });
    queryRequired<HTMLInputElement>("#arrowSelectionEnabled").addEventListener("change", (event) => {
      const enabled = (event.currentTarget as HTMLInputElement).checked;
      this.#store.update((project) => { project.interaction.arrowKeyTrackSelectionEnabled = enabled; });
      this.#setStatus(`Arrow-key track selection ${enabled ? "enabled" : "disabled"}.`);
    });
    queryRequired<HTMLButtonElement>("#cameraButton").addEventListener("click", () => { void this.#startCamera(); });
    queryRequired<HTMLButtonElement>("#syntheticButton").addEventListener("click", () => { void this.#startSynthetic(); });
    queryRequired<HTMLButtonElement>("#gestureStopButton").addEventListener("click", () => this.#stopGesture());
    queryRequired<HTMLButtonElement>("#fullscreenButton").addEventListener("click", () => { void this.#toggleCameraFullscreen(); });
    document.addEventListener("fullscreenchange", () => {
      const active = document.fullscreenElement === queryRequired<HTMLElement>(".camera-stage");
      const button = queryRequired<HTMLButtonElement>("#fullscreenButton");
      button.textContent = active ? "Exit fullscreen" : "Fullscreen";
      button.setAttribute("aria-pressed", String(active));
    });
    queryRequired<HTMLInputElement>("#mirrorCamera").addEventListener("change", (event) => {
      const source = this.#gestureSource as GestureSource & { setMirrored?: (mirrored: boolean) => void };
      source?.setMirrored?.((event.currentTarget as HTMLInputElement).checked);
    });
    for (const option of document.querySelectorAll<HTMLButtonElement>("[data-gesture-control-mode]")) {
      option.addEventListener("click", () => {
        const mode = option.dataset.gestureControlMode as GestureControlMode | undefined;
        if (mode) this.#setGestureControlMode(mode);
      });
    }
    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const isEditing = (target instanceof HTMLInputElement && target.type !== "checkbox")
        || target instanceof HTMLSelectElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable);
      const settingsOpen = queryRequired<HTMLDialogElement>("#settingsDialog").open;
      const modifierMatches = this.#workspaceSettings.hotkeyModifier === "shift" ? event.shiftKey : !event.shiftKey;
      if (isEditing || settingsOpen || !this.#workspaceSettings.hotkeysEnabled || !modifierMatches || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const arrows = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"];
      if (arrows.includes(event.code) && !this.#store.snapshot.interaction.arrowKeyTrackSelectionEnabled) return;
      if (!["Space", "KeyM", "KeyI", "KeyL", "KeyS", "KeyR", "KeyC", "KeyN", "KeyF", ...arrows].includes(event.code)) return;
      event.preventDefault();
      if (event.code === "Space") {
        if (this.#transport.snapshot.state === "playing") this.#transport.pause(); else void this.#transport.play();
      }
      if (arrows.includes(event.code)) this.#navigateTrack(event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 1);
      if (event.code === "KeyM") this.#toggleSelectedTrackShortcut("muted");
      if (event.code === "KeyI") this.#toggleSelectedTrackShortcut("solo");
      if (event.code === "KeyL") this.#toggleLoopShortcut();
      if (event.code === "KeyS") this.#toggleExperimentalShortcut("stutter");
      if (event.code === "KeyR") this.#toggleExperimentalShortcut("reverse");
      if (event.code === "KeyC") this.#captureScene();
      if (event.code === "KeyN") this.#activateNextScene();
      if (event.code === "KeyF") void this.#toggleCameraFullscreen();
    });
  }

  async #loadDemo(): Promise<void> {
    this.#setStatus("Reading the local example-stem manifest…");
    try {
      const response = await fetch("/__demo_manifest");
      if (!response.ok) throw new Error("The example manifest is available only from the local development server.");
      const stems = await response.json() as DemoStem[];
      const missing = stems.filter((stem) => !stem.available);
      if (missing.length > 0) throw new Error(`Missing example file: ${missing[0]?.filename ?? "unknown"}`);
      await this.#addAudioSet(stems.map((stem) => ({ ...stem, mimeType: "audio/wav" })), "Nazca Lines — Lonov");
    } catch (error) {
      this.#setStatus(error instanceof Error ? error.message : "The example stems could not be loaded.", true);
    }
  }

  async #importFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const audioFiles = [...files].filter((file) => file.type.startsWith("audio/") || /\.(wav|mp3|flac|m4a)$/i.test(file.name));
    if (audioFiles.length === 0) {
      this.#setStatus("No supported audio file selected. Use WAV, MP3, FLAC or M4A.", true);
      return;
    }
    const items: ImportableAudio[] = [];
    for (const file of audioFiles) {
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const role = inferRole(file.name);
      items.push({ filename: file.name, role, name: role === "custom" ? file.name.replace(/\.[^.]+$/, "") : role[0]?.toUpperCase() + role.slice(1), url: URL.createObjectURL(file), mimeType: file.type || "audio/wav", sha256 });
    }
    await this.#addAudioSet(items, audioFiles.length === 1 ? audioFiles[0]?.name.replace(/\.[^.]+$/, "") ?? "Imported project" : "Imported stems");
  }

  async #addAudioSet(items: ImportableAudio[], projectName: string): Promise<void> {
    const initialTrackCount = this.#store.snapshot.tracks.length;
    const addedItems: Array<{ trackId: string; item: ImportableAudio }> = [];
    const unusedObjectUrls: string[] = [];
    this.#store.update((project) => {
      if (project.tracks.length === 0) project.name = projectName;
      for (const [index, item] of items.entries()) {
        const assetId = item.sha256 ? `asset_${item.sha256.slice(0, 20)}` : `asset_${crypto.randomUUID()}`;
        const trackId = `track_${crypto.randomUUID()}`;
        const existingAsset = project.assets.find((asset) => asset.id === assetId);
        if (existingAsset && !existingAsset.objectUrl) existingAsset.objectUrl = item.url;
        const sourceUrl = existingAsset?.objectUrl ?? item.url;
        if (!existingAsset) {
          project.assets.push({ id: assetId, filename: item.filename, mimeType: item.mimeType, objectUrl: sourceUrl, ...(item.sha256 ? { sha256: item.sha256 } : {}) });
        } else if (sourceUrl !== item.url && item.url.startsWith("blob:")) {
          unusedObjectUrls.push(item.url);
        }
        project.tracks.push({ id: trackId, name: item.name, role: item.role, sourceAssetId: assetId, colorIndex: initialTrackCount + index + 1, audioState: defaultAudioTrackState(), synth: defaultSynthTrackState() });
        addedItems.push({ trackId, item: { ...item, url: sourceUrl } });
      }
      const firstAdded = addedItems[0];
      if (!project.selectedTrackId && firstAdded) project.selectedTrackId = firstAdded.trackId;
    });
    for (const url of unusedObjectUrls) URL.revokeObjectURL(url);
    this.#appendTrackRows(addedItems.map(({ trackId }) => trackId));

    let loaded = 0;
    for (const [index, { trackId, item }] of addedItems.entries()) {
      const track = this.#store.snapshot.tracks.find((candidate) => candidate.id === trackId);
      if (!track) continue;
      this.#setStatus(`Decoding ${item.name} (${index + 1}/${items.length})…`);
      const waveform = this.#waveforms.get(track.id);
      if (!waveform) continue;
      try {
        const result = await waveform.load(item.url);
        this.#audio.addTrack(track, result.buffer);
        loaded += 1;
        const row = queryRequired<HTMLElement>(`[data-track-id="${track.id}"]`);
        const meta = queryRequired<HTMLElement>(".track-duration", row);
        meta.textContent = formatTime(result.duration);
      } catch (error) {
        this.#setStatus(`${item.filename} could not be decoded: ${error instanceof Error ? error.message : "unknown browser error"}`, true);
      }
    }
    this.#transport.setDuration(this.#audio.duration);
    if (this.#transport.snapshot.state === "playing") this.#transport.seek(this.#transport.snapshot.currentSeconds);
    const ready = this.#audio.duration > 0;
    this.#syncTrackListActions(ready);
    this.#syncInspector();
    const total = this.#store.snapshot.tracks.length;
    this.#setStatus(loaded > 0
      ? `${loaded} ${loaded === 1 ? "stem" : "stems"} added · ${total} ${total === 1 ? "track" : "tracks"} ready.`
      : "No new audio track could be decoded. Existing tracks remain available.", loaded === 0);
  }

  #renderTracks(): void {
    const container = queryRequired<HTMLElement>("#tracks");
    for (const waveform of this.#waveforms.values()) waveform.destroy();
    this.#waveforms.clear();
    const project = this.#store.snapshot;
    setText("#trackCount", `${project.tracks.length} ${project.tracks.length === 1 ? "track" : "tracks"}`);
    if (project.tracks.length === 0) {
      container.innerHTML = `<div class="empty-state"><p class="meta">No audio loaded</p><h2>Add the four local example stems</h2><p>Or add pre-separated WAV, MP3, FLAC or M4A files. Source files remain unchanged.</p></div>`;
      this.#renderTrackZones();
      return;
    }
    container.innerHTML = project.tracks.map((track) => this.#trackRowTemplate(track, project.selectedTrackId)).join("");

    for (const row of container.querySelectorAll<HTMLElement>(".track-row")) {
      const trackId = row.dataset.trackId;
      if (!trackId) continue;
      this.#bindTrackRow(row, trackId);
    }
    const selectedIndex = Math.max(0, project.tracks.findIndex((track) => track.id === project.selectedTrackId));
    this.#trackSelection.setSelected(selectedIndex);
    this.#renderTrackZones();
  }

  #trackRowTemplate(track: ProjectTrack, selectedTrackId?: string): string {
    return `
      <article class="track-row" data-track-id="${track.id}" aria-selected="${String(track.id === selectedTrackId)}">
        <div class="track-identity">
          <button class="track-select" type="button" data-action="select"><strong>${this.#escape(track.name)}</strong><br><span class="meta">${roleLabel(track.role)} / <span class="track-duration">decoding</span></span></button>
        </div>
        <div class="track-waveform" aria-label="${this.#escape(track.name)} waveform"></div>
        <div class="track-actions">
          <button class="secondary" type="button" data-action="mute" aria-pressed="${String(track.audioState.muted)}" aria-label="Mute ${this.#escape(track.name)}">M</button>
          <button class="secondary" type="button" data-action="solo" aria-pressed="${String(track.audioState.solo)}" aria-label="Solo ${this.#escape(track.name)}">S</button>
          <label class="mini-control"><span>Gain</span><input type="range" data-action="gain" min="0" max="1.25" step="0.01" value="${track.audioState.gain}" /></label>
          <label class="mini-control"><span>Pan</span><input type="range" data-action="pan" min="-1" max="1" step="0.01" value="${track.audioState.pan}" /></label>
        </div>
      </article>`;
  }

  #bindTrackRow(row: HTMLElement, trackId: string): void {
    queryRequired<HTMLButtonElement>("[data-action='select']", row).addEventListener("click", () => this.#selectTrack(trackId));
    queryRequired<HTMLButtonElement>("[data-action='mute']", row).addEventListener("click", () => this.#toggleTrackState(trackId, "muted"));
    queryRequired<HTMLButtonElement>("[data-action='solo']", row).addEventListener("click", () => this.#toggleTrackState(trackId, "solo"));
    queryRequired<HTMLInputElement>("[data-action='gain']", row).addEventListener("input", (event) => this.#setTrackParameter(trackId, "gain", Number((event.currentTarget as HTMLInputElement).value)));
    queryRequired<HTMLInputElement>("[data-action='pan']", row).addEventListener("input", (event) => this.#setTrackParameter(trackId, "pan", Number((event.currentTarget as HTMLInputElement).value)));
    const waveformContainer = queryRequired<HTMLElement>(".track-waveform", row);
    this.#waveforms.set(trackId, new WaveformView(waveformContainer, (seconds) => this.#transport.seek(seconds)));
  }

  #appendTrackRows(trackIds: string[]): void {
    const container = queryRequired<HTMLElement>("#tracks");
    const project = this.#store.snapshot;
    if (project.tracks.length === trackIds.length) container.innerHTML = "";
    for (const trackId of trackIds) {
      const track = project.tracks.find((candidate) => candidate.id === trackId);
      if (!track) continue;
      container.insertAdjacentHTML("beforeend", this.#trackRowTemplate(track, project.selectedTrackId));
      const row = queryRequired<HTMLElement>(`[data-track-id="${trackId}"]`, container);
      this.#bindTrackRow(row, trackId);
    }
    setText("#trackCount", `${project.tracks.length} ${project.tracks.length === 1 ? "track" : "tracks"}`);
    const selectedIndex = Math.max(0, project.tracks.findIndex((track) => track.id === project.selectedTrackId));
    this.#trackSelection.setSelected(selectedIndex);
    this.#renderTrackZones();
  }

  #syncTrackListActions(audioReady: boolean): void {
    for (const selector of ["#playButton", "#stopButton", "#recordButton", "#automationButton", "#saveSceneButton", "#nextSceneButton"] as const) {
      queryRequired<HTMLButtonElement>(selector).disabled = !audioReady;
    }
    queryRequired<HTMLButtonElement>("#clearTracksButton").disabled = this.#store.snapshot.tracks.length === 0;
  }

  #clearTrackList(): void {
    const snapshot = this.#store.snapshot;
    if (snapshot.tracks.length === 0) return;
    if (!window.confirm(`Clear all ${snapshot.tracks.length} tracks from this project? Original audio files will not be changed.`)) return;
    this.#resetRuntime();
    for (const asset of snapshot.assets) {
      if (asset.objectUrl?.startsWith("blob:")) URL.revokeObjectURL(asset.objectUrl);
    }
    this.#store.update((project) => {
      project.assets = [];
      project.tracks = [];
      project.scenes = [];
      project.automation = [];
      delete project.selectedTrackId;
      delete project.activeSceneId;
    });
    this.#transport.setDuration(0);
    this.#renderTracks();
    this.#syncTrackListActions(false);
    this.#syncInspector();
    this.#setStatus("Track list cleared. Original audio files remain unchanged.");
  }

  #selectTrack(trackId: string): void {
    this.#store.update((project) => { project.selectedTrackId = trackId; });
    const selectedIndex = this.#store.snapshot.tracks.findIndex((track) => track.id === trackId);
    if (selectedIndex >= 0) this.#trackSelection.setSelected(selectedIndex);
    for (const row of document.querySelectorAll<HTMLElement>(".track-row")) row.setAttribute("aria-selected", String(row.dataset.trackId === trackId));
    this.#renderTrackZones();
    this.#syncInspector();
  }

  #navigateTrack(direction: -1 | 1): void {
    const project = this.#store.snapshot;
    if (project.tracks.length === 0) return;
    const current = Math.max(0, project.tracks.findIndex((track) => track.id === project.selectedTrackId));
    const next = Math.min(project.tracks.length - 1, Math.max(0, current + direction));
    const nextTrack = project.tracks[next];
    if (!nextTrack || next === current) return;
    this.#selectTrack(nextTrack.id);
    this.#setStatus(`Selected ${nextTrack.name} with arrow keys.`);
  }

  #renderTrackZones(decision?: TrackSelectionDecision): void {
    const container = document.querySelector<HTMLElement>("#trackZones");
    if (!container) return;
    const project = this.#store.snapshot;
    container.style.gridTemplateColumns = `repeat(${Math.max(1, project.tracks.length)}, 1fr)`;
    container.innerHTML = project.tracks.map((track, index) => {
      const selected = track.id === project.selectedTrackId;
      const candidate = decision?.candidateIndex === index;
      const progress = candidate ? Math.round(decision.candidateProgress * 100) : 0;
      return `<div class="track-zone${selected ? " is-selected" : ""}${candidate ? " is-candidate" : ""}"><span>${this.#escape(track.name)}</span>${candidate ? `<small>${progress}%</small>` : ""}</div>`;
    }).join("");
  }

  #toggleTrackState(trackId: string, property: "muted" | "solo"): void {
    this.#store.update((project) => {
      const track = project.tracks.find((candidate) => candidate.id === trackId);
      if (track) track.audioState[property] = !track.audioState[property];
    });
    const track = this.#store.snapshot.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    this.#audio.updateTrack(track);
    queryRequired<HTMLButtonElement>(`[data-track-id="${trackId}"] [data-action="${property === "muted" ? "mute" : "solo"}"]`).setAttribute("aria-pressed", String(track.audioState[property]));
  }

  #setTrackParameter(trackId: string, property: NumericTrackParameter, value: number): void {
    this.#store.update((project) => {
      const track = project.tracks.find((candidate) => candidate.id === trackId);
      if (track) track.audioState[property] = value;
    });
    const track = this.#store.snapshot.tracks.find((candidate) => candidate.id === trackId);
    if (track) this.#audio.updateTrack(track);
    if (this.#store.snapshot.selectedTrackId === trackId) this.#syncInspector();
  }

  #bindInspectorControl(selector: string, property: NumericTrackParameter): void {
    queryRequired<HTMLInputElement>(selector).addEventListener("input", (event) => {
      const trackId = this.#store.snapshot.selectedTrackId;
      if (trackId) this.#setTrackParameter(trackId, property, Number((event.currentTarget as HTMLInputElement).value));
    });
  }

  #setSynthState(patch: Partial<SynthTrackState>): void {
    const selectedId = this.#store.snapshot.selectedTrackId;
    if (!selectedId) return;
    this.#store.update((project) => {
      const track = project.tracks.find((candidate) => candidate.id === selectedId);
      if (!track) return;
      track.synth = { ...defaultSynthTrackState(), ...track.synth, ...patch };
    });
    const track = this.#store.snapshot.tracks.find((candidate) => candidate.id === selectedId);
    if (track) this.#audio.updateTrack(track);
    this.#syncInspector();
  }

  #setStutterState(patch: { enabled?: boolean; seconds?: number }): void {
    const selectedId = this.#store.snapshot.selectedTrackId;
    if (!selectedId) return;
    this.#store.update((project) => {
      const track = project.tracks.find((candidate) => candidate.id === selectedId);
      if (!track) return;
      if (patch.enabled !== undefined) track.audioState.stutterEnabled = patch.enabled;
      if (patch.seconds !== undefined) track.audioState.stutterSeconds = patch.seconds;
    });
    const track = this.#store.snapshot.tracks.find((candidate) => candidate.id === selectedId);
    if (track) this.#audio.updateTrack(track);
    this.#syncInspector();
  }

  #setExperimentalToggle(property: "reverseEnabled", enabled: boolean): void {
    const selectedId = this.#store.snapshot.selectedTrackId;
    if (!selectedId) return;
    this.#store.update((project) => {
      const track = project.tracks.find((candidate) => candidate.id === selectedId);
      if (track) track.audioState[property] = enabled;
    });
    const track = this.#store.snapshot.tracks.find((candidate) => candidate.id === selectedId);
    if (track) this.#audio.updateTrack(track);
    if (this.#transport.snapshot.state === "playing") this.#transport.seek(this.#transport.snapshot.currentSeconds);
    this.#syncInspector();
  }

  #toggleExperimentalShortcut(effect: "stutter" | "reverse"): void {
    const project = this.#store.snapshot;
    const track = project.tracks.find((candidate) => candidate.id === project.selectedTrackId);
    if (!track) {
      this.#setStatus(`Select a track before toggling ${effect}.`, true);
      return;
    }
    if (effect === "stutter") {
      const enabled = !track.audioState.stutterEnabled;
      this.#setStutterState({ enabled });
      this.#setStatus(`${track.name} / Stutter ${enabled ? "on" : "off"}.`);
      return;
    }
    const enabled = !track.audioState.reverseEnabled;
    this.#setExperimentalToggle("reverseEnabled", enabled);
    this.#setStatus(`${track.name} / Reverse ${enabled ? "on" : "off"}.`);
  }

  #toggleSelectedTrackShortcut(property: "muted" | "solo"): void {
    const project = this.#store.snapshot;
    const track = project.tracks.find((candidate) => candidate.id === project.selectedTrackId);
    if (!track) {
      this.#setStatus("Select a track before using track hotkeys.", true);
      return;
    }
    const enabled = !track.audioState[property];
    this.#toggleTrackState(track.id, property);
    this.#setStatus(`${track.name} / ${property === "muted" ? "Mute" : "Solo"} ${enabled ? "on" : "off"}.`);
  }

  #toggleLoopShortcut(): void {
    const checkbox = queryRequired<HTMLInputElement>("#loopEnabled");
    checkbox.checked = !checkbox.checked;
    this.#updateLoop();
    this.#setStatus(`Loop ${checkbox.checked ? "on" : "off"}.`);
  }

  #exportSelectedMidi(): void {
    const project = this.#store.snapshot;
    const track = project.tracks.find((candidate) => candidate.id === project.selectedTrackId);
    if (!track?.transcription) return;
    const blob = new Blob([encodeMidi(track.transcription.notes, project.tempo ?? 120) as BlobPart], { type: "audio/midi" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${track.name.replace(/[^a-z0-9_-]+/gi, "-") || "track"}.mid`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    this.#setStatus(`${track.name} exported as Standard MIDI File.`);
  }

  async #transcribeSelectedTrack(): Promise<void> {
    const project = this.#store.snapshot;
    const track = project.tracks.find((candidate) => candidate.id === project.selectedTrackId);
    const asset = project.assets.find((candidate) => candidate.id === track?.sourceAssetId);
    if (!track || !asset?.objectUrl) {
      this.#setStatus("The source audio must be re-imported before transcription.", true);
      return;
    }
    if (track.role === "drums") {
      this.#setStatus("Drum stems are intentionally excluded from melodic transcription.", true);
      return;
    }
    const button = queryRequired<HTMLButtonElement>("#transcribeButton");
    button.disabled = true;
    setText("#transcriptionStatus", "Uploading local asset…");
    try {
      const sourceResponse = await fetch(asset.objectUrl);
      if (!sourceResponse.ok) throw new Error("The local source audio is no longer available.");
      const uploaded = await this.#processor.uploadAsset(project.id, await sourceResponse.blob(), asset.filename);
      setText("#transcriptionStatus", "Basic Pitch is analyzing notes…");
      const result = await this.#processor.transcribe(project.id, uploaded.id);
      this.#store.update((mutable) => {
        const target = mutable.tracks.find((candidate) => candidate.id === track.id);
        if (!target) return;
        target.transcription = {
          source: "basic-pitch",
          createdAt: new Date().toISOString(),
          confidenceThreshold: result.confidenceThreshold,
          notes: result.notes
        };
        target.synth = { ...defaultSynthTrackState(), ...target.synth };
      });
      const updated = this.#store.snapshot.tracks.find((candidate) => candidate.id === track.id);
      if (updated) this.#audio.updateTrack(updated);
      this.#syncInspector();
      this.#setStatus(`${result.notes.length} notes detected in ${track.name}. Resynthesis is ready.`);
    } catch (error) {
      this.#setStatus(error instanceof Error ? error.message : "Transcription failed.", true);
      setText("#transcriptionStatus", "Transcription unavailable");
    } finally {
      this.#syncInspector();
    }
  }

  #syncInspector(): void {
    const project = this.#store.snapshot;
    const track = project.tracks.find((candidate) => candidate.id === project.selectedTrackId);
    this.#effectVisualizer?.update(track, this.#lastGestureFrame);
    setText("#hudTrack", track?.name ?? "No track");
    setText("#hudEffects", track ? `LP ${Math.round(track.audioState.filterCutoff)} · DLY ${Math.round(track.audioState.delayMix * 100)}% · REV ${Math.round(track.audioState.reverbMix * 100)}%` : "LP — · DLY — · REV —");
    setText("#inspectorHeading", track?.name ?? "No track selected");
    queryRequired<HTMLInputElement>("#arrowSelectionEnabled").checked = project.interaction.arrowKeyTrackSelectionEnabled;
    const controls = [
      ["#gainControl", "#gainValue", track?.audioState.gain, (value: number) => value.toFixed(2)],
      ["#panControl", "#panValue", track?.audioState.pan, (value: number) => value.toFixed(2)],
      ["#highpassControl", "#highpassValue", track?.audioState.highpassCutoff, (value: number) => `${Math.round(value)} Hz`],
      ["#cutoffControl", "#cutoffValue", track?.audioState.filterCutoff, (value: number) => `${Math.round(value)} Hz`],
      ["#resonanceControl", "#resonanceValue", track?.audioState.filterResonance, (value: number) => `${value.toFixed(1)} Q`],
      ["#filterModDepthControl", "#filterModDepthValue", track?.audioState.filterModDepth, (value: number) => `${Math.round(value * 100)}%`],
      ["#filterModRateControl", "#filterModRateValue", track?.audioState.filterModRate, (value: number) => `${value.toFixed(2)} Hz`],
      ["#delayTimeControl", "#delayTimeValue", track?.audioState.delayTime, (value: number) => `${value.toFixed(2)} s`],
      ["#delayFeedbackControl", "#delayFeedbackValue", track?.audioState.delayFeedback, (value: number) => `${Math.round(value * 100)}%`],
      ["#delayMixControl", "#delayMixValue", track?.audioState.delayMix, (value: number) => `${Math.round(value * 100)}%`],
      ["#reverbMixControl", "#reverbMixValue", track?.audioState.reverbMix, (value: number) => `${Math.round(value * 100)}%`]
      ,["#saturationControl", "#saturationValue", track?.audioState.saturation, (value: number) => `${Math.round(value * 100)}%`]
      ,["#bitDepthControl", "#bitDepthValue", track?.audioState.bitDepth, (value: number) => `${Math.round(value)} bit`]
      ,["#tremoloDepthControl", "#tremoloDepthValue", track?.audioState.tremoloDepth, (value: number) => `${Math.round(value * 100)}%`]
      ,["#tremoloRateControl", "#tremoloRateValue", track?.audioState.tremoloRate, (value: number) => `${value.toFixed(1)} Hz`]
      ,["#freezeControl", "#freezeValue", track?.audioState.freezeFeedback, (value: number) => `${Math.round(value * 100)}%`]
      ,["#reverseRateControl", "#reverseRateValue", track?.audioState.reverseRate, (value: number) => `${value.toFixed(2)}×`]
    ] as const;
    for (const [inputSelector, outputSelector, value, format] of controls) {
      const input = queryRequired<HTMLInputElement>(inputSelector);
      input.disabled = value === undefined;
      if (value !== undefined) input.value = String(value);
      setText(outputSelector, value === undefined ? "—" : format(value));
    }
    const stutterEnabled = queryRequired<HTMLInputElement>("#stutterEnabled");
    stutterEnabled.disabled = !track;
    stutterEnabled.checked = track?.audioState.stutterEnabled ?? false;
    const stutterSize = queryRequired<HTMLInputElement>("#stutterSize");
    stutterSize.disabled = !track;
    stutterSize.value = String(track?.audioState.stutterSeconds ?? 0.125);
    setText("#stutterSizeValue", track ? `${track.audioState.stutterSeconds.toFixed(3)} s` : "—");
    const reverseEnabled = queryRequired<HTMLInputElement>("#reverseEnabled");
    reverseEnabled.disabled = !track;
    reverseEnabled.checked = track?.audioState.reverseEnabled ?? false;
    const stutterQuickButton = queryRequired<HTMLButtonElement>("#stutterQuickButton");
    stutterQuickButton.disabled = !track;
    stutterQuickButton.setAttribute("aria-pressed", String(track?.audioState.stutterEnabled ?? false));
    const reverseQuickButton = queryRequired<HTMLButtonElement>("#reverseQuickButton");
    reverseQuickButton.disabled = !track;
    reverseQuickButton.setAttribute("aria-pressed", String(track?.audioState.reverseEnabled ?? false));
    const transcribable = Boolean(track && track.role !== "drums" && this.#transcriptionAvailable);
    queryRequired<HTMLButtonElement>("#transcribeButton").disabled = !transcribable;
    queryRequired<HTMLButtonElement>("#midiExportButton").disabled = !track?.transcription;
    setText(
      "#transcriptionStatus",
      track?.transcription
        ? `${track.transcription.notes.length} notes / ${track.transcription.source}`
        : track?.role === "drums"
          ? "Drums are not transcribed"
          : "No note analysis"
    );
    const synthReady = Boolean(track?.transcription && track.synth);
    const synthEnabled = queryRequired<HTMLInputElement>("#synthEnabled");
    synthEnabled.disabled = !synthReady;
    synthEnabled.checked = track?.synth?.enabled ?? false;
    const synthMix = queryRequired<HTMLInputElement>("#synthMixControl");
    synthMix.disabled = !synthReady;
    synthMix.value = String(track?.synth?.mix ?? 0);
    setText("#synthMixValue", synthReady ? `${Math.round((track?.synth?.mix ?? 0) * 100)}%` : "—");
    const oscillator = queryRequired<HTMLSelectElement>("#oscillatorControl");
    oscillator.disabled = !synthReady;
    oscillator.value = track?.synth?.oscillator ?? "triangle";
    for (const [selector, outputSelector, value] of [
      ["#attackControl", "#attackValue", track?.synth?.attack],
      ["#releaseControl", "#releaseValue", track?.synth?.release]
    ] as const) {
      const input = queryRequired<HTMLInputElement>(selector);
      input.disabled = !synthReady;
      if (value !== undefined) input.value = String(value);
      setText(outputSelector, value === undefined ? "—" : `${value.toFixed(2)} s`);
    }
  }

  async #startCamera(): Promise<void> {
    this.#stopGesture();
    this.#setStatus("Loading the local hand-tracking runtime and requesting camera access…");
    const { MediaPipeGestureSource } = await import("../gestures/mediapipe-gesture-source");
    const source = new MediaPipeGestureSource(queryRequired<HTMLVideoElement>("#cameraVideo"), queryRequired<HTMLCanvasElement>("#cameraCanvas"));
    source.setMirrored(queryRequired<HTMLInputElement>("#mirrorCamera").checked);
    await this.#activateGestureSource(source, "Camera / MediaPipe");
  }

  async #startSynthetic(): Promise<void> {
    this.#stopGesture();
    await this.#activateGestureSource(new SyntheticGestureSource(), "Synthetic test signal");
  }

  async #activateGestureSource(source: GestureSource, label: string): Promise<void> {
    this.#gestureSource = source;
    this.#gestureUnsubscribe = source.subscribe((frame) => this.#handleGestureFrame(frame));
    try {
      await source.start();
      setText("#gestureMode", label);
      queryRequired<HTMLButtonElement>("#gestureStopButton").disabled = false;
      this.#setStatus(`${label} active. Gesture mappings are controlling the selected track.`);
    } catch (error) {
      this.#stopGesture();
      this.#setStatus(`Gesture input could not start: ${error instanceof Error ? error.message : "permission or model error"}`, true);
    }
  }

  #stopGesture(): void {
    this.#gestureUnsubscribe?.();
    this.#gestureUnsubscribe = undefined;
    this.#gestureSource?.stop();
    this.#gestureSource = undefined;
    setText("#gestureMode", "Input inactive");
    setText("#gestureReadout", "Awaiting hand signal");
    setText("#depthReadout", "Distance —");
    this.#updateGestureSignalPanel({ timestamp: performance.now(), features: {}, handsVisible: [] });
    queryRequired<HTMLElement>("#signalPoint").hidden = true;
    queryRequired<HTMLButtonElement>("#gestureStopButton").disabled = true;
    this.#renderTrackZones();
  }

  #handleGestureFrame(frame: GestureFrame): void {
    const now = performance.now();
    this.#lastGestureFrame = frame;
    this.#collectGestureLearn(frame, now);
    setText("#gestureLatency", `${Math.max(0, now - frame.timestamp).toFixed(1)} ms`);
    const point = queryRequired<HTMLElement>("#signalPoint");
    const rightX = frame.features["right.x"];
    const rightY = frame.features["right.y"];
    const rightZ = frame.features["right.z"];
    setText(
      "#depthReadout",
      rightZ === undefined ? "Distance —" : `Camera proximity ${Math.round(rightZ * 100)}%`
    );
    setText("#hudDepth", rightZ === undefined ? "Depth —" : `Depth ${Math.round(rightZ * 100)}%`);
    if (rightX !== undefined && rightY !== undefined) {
      point.hidden = false;
      point.style.left = `${rightX * 100}%`;
      point.style.top = `${rightY * 100}%`;
    } else {
      point.hidden = true;
    }
    if (now - this.#lastGestureWrite < 32) return;
    this.#lastGestureWrite = now;
    this.#updateGestureSignalPanel(frame);
    const outputs = this.#mappingEngine.process(frame);
    const project = this.#store.snapshot;
    let selectedTrackId = project.selectedTrackId;
    for (const output of outputs) {
      if (
        output.mapping.target.type === "track-selection"
        && project.tracks.length > 0
        && !project.interaction.arrowKeyTrackSelectionEnabled
      ) {
        const decision = this.#trackSelection.next(
          output.mappedValue,
          project.tracks.length,
          now,
          project.interaction.trackSelectionDwellMs,
          project.interaction.trackSelectionHysteresis
        );
        this.#renderTrackZones(decision);
        if (decision.changed) selectedTrackId = project.tracks[decision.selectedIndex]?.id;
      }
      if (this.#automationRecording && output.mapping.target.type === "selected-track-parameter") {
        this.#recordAutomationPoint(output.mapping.id, output.mappedValue, now);
      }
    }
    if (selectedTrackId && selectedTrackId !== project.selectedTrackId) this.#selectTrack(selectedTrackId);
    const selected = this.#store.snapshot.tracks.find((track) => track.id === selectedTrackId);
    if (!selected) return;
    let reverseStateChanged = false;
    for (const output of outputs) {
      if (output.mapping.target.type === "selected-track-toggle") {
        if (output.gateState === undefined || !output.gateChanged) continue;
        if (output.mapping.target.parameter === "stutter.enabled") {
          selected.audioState.stutterEnabled = output.gateState;
        }
        if (output.mapping.target.parameter === "reverse.enabled") {
          reverseStateChanged = selected.audioState.reverseEnabled !== output.gateState;
          selected.audioState.reverseEnabled = output.gateState;
        }
        continue;
      }
      if (output.mapping.target.type !== "selected-track-parameter") continue;
      if (output.mapping.target.parameter === "resynthesis.mix") {
        if (selected.transcription) {
          selected.synth = { ...defaultSynthTrackState(), ...selected.synth, enabled: true, mix: output.mappedValue };
        }
      } else {
        this.#applyMappedParameter(selected.audioState, output.mapping.target.parameter, output.mappedValue);
      }
      this.#sendMidiMapping(output.mapping.target.parameter, Math.max(0, Math.min(1, output.sourceValue)));
    }
    this.#store.update((mutable) => {
      const target = mutable.tracks.find((track) => track.id === selected.id);
      if (target) {
        target.audioState = { ...selected.audioState };
        if (selected.synth) target.synth = { ...selected.synth };
      }
      mutable.selectedTrackId = selected.id;
    });
    this.#audio.updateTrack(selected);
    if (reverseStateChanged && this.#transport.snapshot.state === "playing") {
      this.#transport.seek(this.#transport.snapshot.currentSeconds);
    }
    this.#syncInspector();
    const cutoff = Math.round(selected.audioState.filterCutoff);
    setText(
      "#gestureReadout",
      `${selected.name} / low-pass ${cutoff} Hz / stutter ${selected.audioState.stutterEnabled ? "on" : "off"} / reverse ${selected.audioState.reverseEnabled ? `${selected.audioState.reverseRate.toFixed(2)}×` : "off"}`
    );
  }

  #updateGestureSignalPanel(frame: GestureFrame): void {
    for (const element of document.querySelectorAll<HTMLElement>("[data-gesture-feature]")) {
      const feature = element.dataset.gestureFeature as GestureFeatureName | undefined;
      if (!feature) continue;
      const value = frame.features[feature];
      const normalized = Math.max(0, Math.min(1, value ?? 0));
      const percentage = Math.round(normalized * 100);
      element.style.setProperty("--gesture-value", `${percentage}%`);
      element.classList.toggle("is-live", value !== undefined);
      const meter = element.querySelector<HTMLElement>("[role='meter']");
      meter?.setAttribute("aria-valuenow", String(percentage));
      const output = element.querySelector<HTMLOutputElement>("output");
      if (output) output.value = value === undefined ? "—" : String(percentage);
    }
  }

  async #toggleCameraFullscreen(): Promise<void> {
    const stage = queryRequired<HTMLElement>(".camera-stage");
    if (document.fullscreenElement === stage) {
      await document.exitFullscreen();
      return;
    }
    await stage.requestFullscreen();
  }

  #applyMappedParameter(
    state: AudioTrackState,
    parameter: GestureContinuousParameter,
    value: number
  ): void {
    if (parameter === "gain") state.gain = value;
    if (parameter === "pan") state.pan = value;
    if (parameter === "filter.highpass") state.highpassCutoff = value;
    if (parameter === "filter.cutoff") state.filterCutoff = value;
    if (parameter === "filter.resonance") state.filterResonance = value;
    if (parameter === "filter.modDepth") state.filterModDepth = value;
    if (parameter === "filter.modRate") state.filterModRate = value;
    if (parameter === "delay.time") state.delayTime = value;
    if (parameter === "delay.feedback") state.delayFeedback = value;
    if (parameter === "delay.mix") state.delayMix = value;
    if (parameter === "reverb.mix") state.reverbMix = value;
    if (parameter === "saturation") state.saturation = value;
    if (parameter === "bitDepth") state.bitDepth = value;
    if (parameter === "tremolo.depth") state.tremoloDepth = value;
    if (parameter === "tremolo.rate") state.tremoloRate = value;
    if (parameter === "freeze.feedback") state.freezeFeedback = value;
    if (parameter === "stutter.seconds") state.stutterSeconds = value;
    if (parameter === "reverse.rate") state.reverseRate = value;
  }

  #startGestureLearn(): void {
    this.#learnTarget = queryRequired<HTMLSelectElement>("#learnTarget").value as GestureContinuousParameter;
    this.#learnStarted = performance.now();
    this.#learnRanges.clear();
    setText("#learnStatus", "Learning for 1.2 seconds — move the intended hand control now.");
  }

  async #enableMidi(): Promise<void> {
    try {
      const outputs = await this.#midi.request();
      const select = queryRequired<HTMLSelectElement>("#midiOutput");
      select.innerHTML = `<option value="">No output</option>${outputs.map((output) => `<option value="${this.#escape(output.id)}">${this.#escape(output.name)}</option>`).join("")}`;
      select.disabled = outputs.length === 0;
      setText("#midiStatus", outputs.length > 0 ? `${outputs.length} MIDI output(s) found.` : "No MIDI outputs found. Create a virtual MIDI port first.");
    } catch (error) {
      setText("#midiStatus", error instanceof Error ? error.message : "MIDI permission failed.");
    }
  }

  #sendMidiMapping(parameter: GestureContinuousParameter, normalizedValue: number): void {
    if (!this.#store.snapshot.midi.enabled) return;
    const controllers: Partial<Record<GestureContinuousParameter, number>> = {
      "filter.cutoff": 74,
      "filter.resonance": 71,
      "filter.modDepth": 1,
      "filter.modRate": 76,
      "delay.feedback": 94,
      "delay.mix": 12,
      "reverb.mix": 91,
      "resynthesis.mix": 13,
      "stutter.seconds": 14,
      "reverse.rate": 15,
      gain: 7,
      pan: 10
    };
    const controller = controllers[parameter];
    if (controller !== undefined) this.#midi.sendControlChange(this.#store.snapshot.midi.channel, controller, normalizedValue);
  }

  #collectGestureLearn(frame: GestureFrame, now: number): void {
    if (!this.#learnTarget) return;
    for (const [source, value] of Object.entries(frame.features)) {
      if (value === undefined || source === "left.x") continue;
      if (this.#workspaceSettings.gestureControlMode === "classic" && isIndividualFingerFeature(source)) continue;
      const range = this.#learnRanges.get(source) ?? { min: value, max: value };
      range.min = Math.min(range.min, value);
      range.max = Math.max(range.max, value);
      this.#learnRanges.set(source, range);
    }
    if (now - this.#learnStarted < 1_200) return;
    const candidate = [...this.#learnRanges.entries()]
      .map(([source, range]) => ({ source, span: range.max - range.min }))
      .sort((a, b) => b.span - a.span)[0];
    const target = this.#learnTarget;
    this.#learnTarget = undefined;
    if (!candidate || candidate.span < 0.08) {
      setText("#learnStatus", "No clear gesture movement detected. Try a larger motion.");
      return;
    }
    const outputRanges: Record<string, [number, number]> = {
      "filter.cutoff": [80, 20_000],
      "filter.resonance": [0.7, 16],
      "filter.modDepth": [0, 1],
      "filter.modRate": [0.05, 12],
      "delay.feedback": [0, 0.72],
      "delay.mix": [0, 0.7],
      "reverb.mix": [0, 0.75],
      "stutter.seconds": [0.03125, 0.5],
      "reverse.rate": [0.5, 2],
      "resynthesis.mix": [0, 1]
    };
    const [outputMin, outputMax] = outputRanges[target] ?? [0, 1];
    const mapping: GestureMapping = {
      id: this.#workspaceSettings.gestureControlMode === "classic"
        ? `classic-learned-${crypto.randomUUID()}`
        : `mapping_learned_${crypto.randomUUID()}`,
      source: candidate.source,
      target: { type: "selected-track-parameter", parameter: target },
      transform: { inputMin: 0.05, inputMax: 0.95, outputMin, outputMax, curve: target === "filter.cutoff" ? "exp" : "s", invert: false, smoothing: 0.8, deadZone: 0.015 },
      enabled: true
    };
    this.#store.update((project) => {
      const classicLearning = this.#workspaceSettings.gestureControlMode === "classic";
      project.mappings = project.mappings.filter((existing) => {
        const existingClassic = existing.id.startsWith("classic-learned-");
        return existing.target.parameter !== target || existingClassic !== classicLearning;
      });
      project.mappings.push(mapping);
    });
    this.#syncActiveGestureMappings();
    setText("#learnStatus", `${candidate.source} now controls ${target}.`);
    this.#setStatus(`Gesture learned: ${candidate.source} → ${target}.`);
  }

  #updateLoop(): void {
    const loop = {
      enabled: queryRequired<HTMLInputElement>("#loopEnabled").checked,
      startSeconds: Number(queryRequired<HTMLInputElement>("#loopStart").value),
      endSeconds: Number(queryRequired<HTMLInputElement>("#loopEnd").value)
    };
    this.#transport.setLoop(loop);
    this.#store.update((project) => { project.loop = loop; });
  }

  async #toggleRecording(): Promise<void> {
    const button = queryRequired<HTMLButtonElement>("#recordButton");
    if (!this.#recording) {
      this.#audio.startRecording();
      this.#recording = true;
      button.textContent = "■";
      button.setAttribute("aria-label", "Stop and export mix");
      button.title = "Stop and export mix";
      button.setAttribute("aria-pressed", "true");
      this.#setStatus("Recording final stereo output locally…");
      return;
    }
    try {
      const recording = await this.#audio.stopRecording();
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(recording);
      anchor.download = `gesture-performance-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      this.#setStatus("Performance recording exported as WebM/Opus.");
    } catch (error) {
      this.#setStatus(error instanceof Error ? error.message : "Recording export failed.", true);
    } finally {
      this.#recording = false;
      button.textContent = "●";
      button.setAttribute("aria-label", "Record mix");
      button.title = "Record mix";
      button.setAttribute("aria-pressed", "false");
    }
  }

  #toggleAutomationRecording(): void {
    this.#automationRecording = !this.#automationRecording;
    const button = queryRequired<HTMLButtonElement>("#automationButton");
    button.textContent = this.#automationRecording ? "■" : "◉";
    button.setAttribute("aria-label", this.#automationRecording ? "Stop gesture recording" : "Record gestures");
    button.title = this.#automationRecording ? "Stop gesture recording" : "Record gestures";
    button.setAttribute("aria-pressed", String(this.#automationRecording));
    this.#lastAutomationPoint.clear();
    this.#setStatus(this.#automationRecording
      ? "Gesture automation recording is active. Move a mapped control while playback runs."
      : `${this.#store.snapshot.automation.reduce((sum, lane) => sum + lane.points.length, 0)} automation points saved in the project.`);
  }

  #recordAutomationPoint(mappingId: string, value: number, now: number): void {
    const previous = this.#lastAutomationPoint.get(mappingId) ?? -Infinity;
    if (now - previous < 50) return;
    this.#lastAutomationPoint.set(mappingId, now);
    const timeSeconds = this.#transport.snapshot.currentSeconds;
    this.#store.update((project) => {
      let lane = project.automation.find((candidate) => candidate.mappingId === mappingId);
      if (!lane) {
        lane = { id: `automation_${crypto.randomUUID()}`, mappingId, points: [] };
        project.automation.push(lane);
      }
      lane.points.push({ timeSeconds, value });
    });
  }

  #playAutomation(timeSeconds: number): void {
    const project = this.#store.snapshot;
    const selected = project.tracks.find((track) => track.id === project.selectedTrackId);
    if (!selected) return;
    let changed = false;
    for (const lane of project.automation) {
      const mapping = project.mappings.find((candidate) => candidate.id === lane.mappingId);
      if (!mapping || mapping.target.type !== "selected-track-parameter") continue;
      let point = lane.points[0]?.timeSeconds !== undefined && lane.points[0].timeSeconds <= timeSeconds
        ? lane.points[0]
        : undefined;
      for (const candidate of lane.points) {
        if (candidate.timeSeconds > timeSeconds) break;
        point = candidate;
      }
      if (!point) continue;
      if (mapping.target.parameter === "resynthesis.mix" && selected.transcription) {
        selected.synth = { ...defaultSynthTrackState(), ...selected.synth, enabled: true, mix: point.value };
      } else {
        this.#applyMappedParameter(selected.audioState, mapping.target.parameter, point.value);
      }
      changed = true;
    }
    if (changed) this.#audio.updateTrack(selected);
  }

  #captureScene(): void {
    this.#store.update((project) => {
      const scene = {
        id: `scene_${crypto.randomUUID()}`,
        name: `Scene ${project.scenes.length + 1}`,
        tracks: project.tracks.map((track) => ({
          trackId: track.id,
          audioState: structuredClone(track.audioState),
          ...(track.synth ? { synth: structuredClone(track.synth) } : {})
        }))
      };
      project.scenes.push(scene);
      project.activeSceneId = scene.id;
    });
    this.#setStatus(`${this.#store.snapshot.scenes.at(-1)?.name ?? "Scene"} captured.`);
  }

  #activateNextScene(): void {
    const snapshot = this.#store.snapshot;
    if (snapshot.scenes.length === 0) {
      this.#setStatus("Capture a scene before switching scenes.", true);
      return;
    }
    const activeIndex = snapshot.scenes.findIndex((scene) => scene.id === snapshot.activeSceneId);
    const scene = snapshot.scenes[(activeIndex + 1) % snapshot.scenes.length];
    if (!scene) return;
    this.#store.update((project) => {
      project.activeSceneId = scene.id;
      for (const sceneTrack of scene.tracks) {
        const track = project.tracks.find((candidate) => candidate.id === sceneTrack.trackId);
        if (!track) continue;
        track.audioState = structuredClone(sceneTrack.audioState);
        if (sceneTrack.synth) track.synth = structuredClone(sceneTrack.synth);
      }
    });
    for (const track of this.#store.snapshot.tracks) this.#audio.updateTrack(track);
    this.#syncInspector();
    this.#setStatus(`${scene.name} activated.`);
  }

  async #loadProjectFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      this.#resetRuntime();
      this.#store.load(await file.text());
      this.#syncActiveGestureMappings();
      this.#renderTracks();
      this.#syncTrackListActions(false);
      this.#syncInspector();
      this.#setStatus("Project state loaded. Re-import the referenced audio files to reconnect source assets.");
    } catch (error) {
      this.#setStatus(error instanceof Error ? error.message : "Project could not be loaded.", true);
    }
  }

  async #checkProcessor(): Promise<void> {
    const status = queryRequired<HTMLElement>("#processorStatus");
    try {
      const response = await fetch(`${PROCESSOR_URL}/health`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error("Processor health check failed");
      const health = await response.json() as ProcessorHealth;
      this.#transcriptionAvailable = health.transcriptionAvailable;
      status.textContent = `Processor ${health.version} / FFmpeg ${health.ffmpegAvailable ? "ready" : "missing"} / Basic Pitch ${health.transcriptionAvailable ? "ready" : "missing"}`;
      status.classList.add("is-online");
      this.#syncInspector();
    } catch {
      this.#transcriptionAvailable = false;
      status.textContent = "Processor offline / playback remains available";
      status.classList.remove("is-online");
    }
  }

  #resetRuntime(): void {
    this.#transport.stop();
    for (const waveform of this.#waveforms.values()) waveform.destroy();
    for (const track of this.#store.snapshot.tracks) this.#audio.removeTrack(track.id);
    this.#waveforms.clear();
  }

  #setStatus(message: string, error = false): void {
    const element = queryRequired<HTMLElement>("#statusMessage");
    element.textContent = message;
    element.classList.toggle("error-message", error);
  }

  #escape(value: string): string {
    const element = document.createElement("span");
    element.textContent = value;
    return element.innerHTML;
  }
}
