import type { GestureControlMode } from "@gsw/gesture-domain";

export type WorkspaceTheme = "dark" | "light";
export type WorkspaceDensity = "compact" | "standard" | "spacious";
export type InspectorWidth = "narrow" | "standard" | "wide";
export type HudPosition = "left" | "right";
export type HotkeyModifier = "none" | "shift";

export interface WorkspaceSettings {
  theme: WorkspaceTheme;
  signalColor: string;
  density: WorkspaceDensity;
  inspectorWidth: InspectorWidth;
  hudPosition: HudPosition;
  signalPanelOpen: boolean;
  gestureControlMode: GestureControlMode;
  hotkeysEnabled: boolean;
  hotkeyModifier: HotkeyModifier;
}

export const WORKSPACE_SETTINGS_KEY = "gesture-stem-workstation.ui.v1";

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  theme: "dark",
  signalColor: "#00e5ff",
  density: "standard",
  inspectorWidth: "standard",
  hudPosition: "left",
  signalPanelOpen: true,
  gestureControlMode: "finger",
  hotkeysEnabled: true,
  hotkeyModifier: "none"
};

const THEMES = new Set<WorkspaceTheme>(["dark", "light"]);
const DENSITIES = new Set<WorkspaceDensity>(["compact", "standard", "spacious"]);
const INSPECTOR_WIDTHS = new Set<InspectorWidth>(["narrow", "standard", "wide"]);
const HUD_POSITIONS = new Set<HudPosition>(["left", "right"]);
const GESTURE_CONTROL_MODES = new Set<GestureControlMode>(["finger", "classic"]);
const HOTKEY_MODIFIERS = new Set<HotkeyModifier>(["none", "shift"]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

export const normalizeHexColor = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
};

export const parseWorkspaceSettings = (value: unknown): WorkspaceSettings => {
  if (!isRecord(value)) return { ...DEFAULT_WORKSPACE_SETTINGS };
  return {
    theme: THEMES.has(value.theme as WorkspaceTheme) ? value.theme as WorkspaceTheme : DEFAULT_WORKSPACE_SETTINGS.theme,
    signalColor: normalizeHexColor(value.signalColor) ?? DEFAULT_WORKSPACE_SETTINGS.signalColor,
    density: DENSITIES.has(value.density as WorkspaceDensity) ? value.density as WorkspaceDensity : DEFAULT_WORKSPACE_SETTINGS.density,
    inspectorWidth: INSPECTOR_WIDTHS.has(value.inspectorWidth as InspectorWidth) ? value.inspectorWidth as InspectorWidth : DEFAULT_WORKSPACE_SETTINGS.inspectorWidth,
    hudPosition: HUD_POSITIONS.has(value.hudPosition as HudPosition) ? value.hudPosition as HudPosition : DEFAULT_WORKSPACE_SETTINGS.hudPosition,
    signalPanelOpen: typeof value.signalPanelOpen === "boolean" ? value.signalPanelOpen : DEFAULT_WORKSPACE_SETTINGS.signalPanelOpen,
    gestureControlMode: GESTURE_CONTROL_MODES.has(value.gestureControlMode as GestureControlMode)
      ? value.gestureControlMode as GestureControlMode
      : DEFAULT_WORKSPACE_SETTINGS.gestureControlMode,
    hotkeysEnabled: typeof value.hotkeysEnabled === "boolean" ? value.hotkeysEnabled : DEFAULT_WORKSPACE_SETTINGS.hotkeysEnabled,
    hotkeyModifier: HOTKEY_MODIFIERS.has(value.hotkeyModifier as HotkeyModifier)
      ? value.hotkeyModifier as HotkeyModifier
      : DEFAULT_WORKSPACE_SETTINGS.hotkeyModifier
  };
};

export const loadWorkspaceSettings = (storage?: Pick<Storage, "getItem">): WorkspaceSettings => {
  try {
    const target = storage ?? window.localStorage;
    const stored = target.getItem(WORKSPACE_SETTINGS_KEY);
    return stored === null ? { ...DEFAULT_WORKSPACE_SETTINGS } : parseWorkspaceSettings(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_WORKSPACE_SETTINGS };
  }
};

export const saveWorkspaceSettings = (
  settings: WorkspaceSettings,
  storage?: Pick<Storage, "setItem">
): boolean => {
  try {
    const target = storage ?? window.localStorage;
    target.setItem(WORKSPACE_SETTINGS_KEY, JSON.stringify(parseWorkspaceSettings(settings)));
    return true;
  } catch {
    return false;
  }
};

const hexToRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16)
];

const relativeLuminance = ([red, green, blue]: [number, number, number]): number => {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (0.2126 * channel(red)) + (0.7152 * channel(green)) + (0.0722 * channel(blue));
};

const contrastRatio = (first: [number, number, number], second: [number, number, number]): number => {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
};

const toHex = ([red, green, blue]: [number, number, number]): string => (
  `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`
);

/** Keeps the chosen hue while enforcing readable signal graphics on the active surface. */
export const resolveSignalColor = (color: string, theme: WorkspaceTheme): string => {
  const normalized = normalizeHexColor(color) ?? DEFAULT_WORKSPACE_SETTINGS.signalColor;
  const source = hexToRgb(normalized);
  const background: [number, number, number] = theme === "dark" ? [0, 0, 0] : [255, 255, 255];
  if (contrastRatio(source, background) >= 4.5) return normalized;

  const target: [number, number, number] = theme === "dark" ? [255, 255, 255] : [0, 0, 0];
  for (let step = 1; step <= 20; step += 1) {
    const mix = step / 20;
    const candidate = source.map((channel, index) => channel + ((target[index] ?? channel) - channel) * mix) as [number, number, number];
    if (contrastRatio(candidate, background) >= 4.5) return toHex(candidate);
  }
  return toHex(target);
};

export interface WorkspaceSettingsTarget {
  classList: Pick<DOMTokenList, "toggle">;
  dataset: Record<string, string | undefined>;
  style: { setProperty(property: string, value: string | null, priority?: string): void };
}

export const applyWorkspaceSettings = (
  settings: WorkspaceSettings,
  target: WorkspaceSettingsTarget = document.body
): { settings: WorkspaceSettings; resolvedSignalColor: string } => {
  const normalized = parseWorkspaceSettings(settings);
  const resolvedSignalColor = resolveSignalColor(normalized.signalColor, normalized.theme);
  target.classList.toggle("theme-invert", normalized.theme === "light");
  target.dataset.density = normalized.density;
  target.dataset.inspectorWidth = normalized.inspectorWidth;
  target.dataset.hudPosition = normalized.hudPosition;
  target.dataset.gestureControlMode = normalized.gestureControlMode;
  target.dataset.hotkeysEnabled = String(normalized.hotkeysEnabled);
  target.style.setProperty("--signal", resolvedSignalColor);
  return { settings: normalized, resolvedSignalColor };
};
