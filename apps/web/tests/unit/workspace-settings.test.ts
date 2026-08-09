import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  WORKSPACE_SETTINGS_KEY,
  applyWorkspaceSettings,
  loadWorkspaceSettings,
  normalizeHexColor,
  parseWorkspaceSettings,
  resolveSignalColor,
  saveWorkspaceSettings
} from "../../src/app/workspace-settings";

describe("workspace settings", () => {
  it("normalizes valid colors and rejects malformed values", () => {
    expect(normalizeHexColor(" #AABBCC ")).toBe("#aabbcc");
    expect(normalizeHexColor("cyan")).toBeUndefined();
  });

  it("keeps valid options while falling back field by field", () => {
    expect(parseWorkspaceSettings({
      theme: "light",
      signalColor: "#ff4d8d",
      density: "unknown",
      inspectorWidth: "wide",
      hudPosition: "right",
      signalPanelOpen: false,
      gestureControlMode: "classic",
      hotkeysEnabled: false,
      hotkeyModifier: "shift"
    })).toEqual({
      ...DEFAULT_WORKSPACE_SETTINGS,
      theme: "light",
      signalColor: "#ff4d8d",
      inspectorWidth: "wide",
      hudPosition: "right",
      signalPanelOpen: false,
      gestureControlMode: "classic",
      hotkeysEnabled: false,
      hotkeyModifier: "shift"
    });
  });

  it("recovers from invalid persisted JSON", () => {
    const storage = { getItem: () => "{" };
    expect(loadWorkspaceSettings(storage)).toEqual(DEFAULT_WORKSPACE_SETTINGS);
  });

  it("saves a normalized settings payload", () => {
    let stored = "";
    expect(saveWorkspaceSettings({ ...DEFAULT_WORKSPACE_SETTINGS, signalColor: "#FF4D8D" }, {
      setItem: (key, value) => {
        expect(key).toBe(WORKSPACE_SETTINGS_KEY);
        stored = value;
      }
    })).toBe(true);
    expect(JSON.parse(stored)).toMatchObject({ signalColor: "#ff4d8d" });
  });

  it("does not block visual application when persistence is unavailable", () => {
    expect(saveWorkspaceSettings(DEFAULT_WORKSPACE_SETTINGS, {
      setItem: () => { throw new DOMException("blocked", "SecurityError"); }
    })).toBe(false);
  });

  it("adapts low-contrast signal colors to either theme", () => {
    expect(resolveSignalColor("#101010", "dark")).not.toBe("#101010");
    expect(resolveSignalColor("#fefefe", "light")).not.toBe("#fefefe");
    expect(resolveSignalColor("#00e5ff", "dark")).toBe("#00e5ff");
  });

  it("connects every visual setting to its document target", () => {
    const classes = new Map<string, boolean>();
    const dataset: Record<string, string> = {};
    const properties = new Map<string, string>();
    const result = applyWorkspaceSettings({
      theme: "light",
      signalColor: "#ff4d8d",
      density: "compact",
      inspectorWidth: "wide",
      hudPosition: "right",
      signalPanelOpen: false,
      gestureControlMode: "classic",
      hotkeysEnabled: false,
      hotkeyModifier: "shift"
    }, {
      classList: { toggle: (token, force) => { classes.set(token, Boolean(force)); return Boolean(force); } },
      dataset,
      style: { setProperty: (property, value) => { properties.set(property, value ?? ""); } }
    });

    expect(classes.get("theme-invert")).toBe(true);
    expect(dataset).toMatchObject({ density: "compact", inspectorWidth: "wide", hudPosition: "right", gestureControlMode: "classic", hotkeysEnabled: "false" });
    expect(properties.get("--signal")).toBe("#cc3e71");
    expect(result.settings.signalPanelOpen).toBe(false);
  });
});
