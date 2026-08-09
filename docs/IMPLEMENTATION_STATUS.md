# Implementation status

Status date: 2026-08-09

## Stable performance path

- Phases 0–5: repository, synchronized audio, separation adapter, MediaPipe, mapping, and the core musical interaction are implemented.
- Phase 6: Basic Pitch adapter, canonical notes, confidence filtering, job API, and MIDI export are implemented. Persistent transcription-result caching and a piano-roll overlay remain follow-up work.
- Phase 7: a synchronized polyphonic Web Audio resynthesis path with oscillator, ADSR, filter, velocity, and continuous source/synth crossfade is implemented. Filter envelope, LFO, and pitch-bend playback remain follow-up work.
- Phase 8: stereo WebM/Opus mix recording and gesture-automation recording/replay are implemented. WAV encoding remains follow-up work.
- Phases 9–10: scene capture/recall and variance-based Gesture Learn are implemented.
- Phase 13: optional Web MIDI CC routing is implemented.
- Phase 16: the project schema supports mapping macros; multiple mappings may already share one gesture source. A dedicated macro editor remains follow-up work.
- Phase 11 has an initial experimental rack: saturation, amplitude quantization/bit reduction, tremolo, short feedback freeze, transport-synchronized stutter, and reverse-buffer playback. All values are non-destructive project state.
- The camera performance surface now supports fullscreen, colored hand landmarks, a transparent WebGL particle display powered by Three.js and `three.quarks`, a compact live HUD, and a 36-pixel bottom stem selector. Crisp, restrained particles remain inside the upper-left third instead of obscuring the complete camera image. Drums, bass, melodic/vocal, and other tracks use distinct emitter and motion presets. Hand position, camera proximity, hand distance, filter, resonance, delay, reverb, freeze, stutter, and reverse modulate the effect without becoming canonical project state.
- Gesture extraction now exposes flexion and normalized fingertip coordinates for all ten fingers, roll/pitch/yaw and palm-facing values for both hands, hand velocity, camera proximity, hand distance, hand angle, and depth difference. The default preset assigns every finger flexion and all six hand rotations to distinct track parameters. Palm-facing gates use hysteresis for stable Stutter and Reverse switching.
- Gesture control now has two complete, persistent profiles. Finger detail retains the individual-finger mapping set. Classic hands uses only whole-hand position, depth, openness, pinch, velocity, rotation, hand angle, and hand distance; its signal matrix and Gesture Learn candidate filter exclude individual fingers. Profile-specific learned mappings remain serialized in project state without leaking into the other profile.
- A dedicated filter LFO is available per track. Stutter length and Reverse playback speed are continuous, non-destructive project state and retain mouse/keyboard-accessible controls alongside gesture mappings.
- The established transport, track, inspector, and camera order remains unchanged. A modal Settings surface adds local theme, contrast-safe signal color, spacing-density, inspector-width, camera-HUD-position, and signal-matrix preferences without causing workspace reflow. Preferences are validated, versioned under a dedicated browser-storage key, and intentionally excluded from musical project state.
- The Settings surface includes a Hotkeys tab with a complete action list, global enable switch, and optional Shift requirement. Central keyboard handling covers transport, track navigation, Mute, Solo, Loop, Stutter, Reverse, scene capture/recall, and camera fullscreen while protecting all editable controls. Stutter and Reverse also have visible quick-toggle buttons; gesture gates now write only on hysteresis transitions so manual hotkey state is not overwritten on every camera frame.
- Settings now apply to the document before persistence is attempted, so blocked browser storage cannot suppress visual changes. Explicit option buttons replace native layout selects, every active option is doubly encoded, and the accent is visible in the brand rail, live meters, ranges, HUD, particles, and selected-state lines. The settings connection tests execute inside the configured `tests/unit` suite.
- The primary workspace chrome has been compacted without changing module order: the redundant header meta line is removed, the track heading and empty state are shallower, and the camera panel now keeps its natural content height instead of stretching to match the long inspector. Transport commands use concise symbols while retaining changing `aria-label` and `title` text. All range inputs share a square, signal-colored thumb and flat bordered track in both themes and disabled states.
- Stem intake is now additive. Both repository examples and user-selected audio append new project assets, tracks, AudioEngine runtimes, and Waveform views without resetting existing tracks or changing the current selection. Duplicate hashed files reuse their immutable asset identity. A separate confirmed Clear track list action removes track-derived project state and runtime nodes while preserving original source files.

## Experimental phases deliberately not promoted to stable

True granular resynthesis, FFT-based spectral freeze, OSC bridging, native plug-in hosting, and mapping-layer editing remain later experiments. They are not required for the first stable instrument and should stay behind feature flags when added, in accordance with `AGENTS.md`.

## Depth control

`right.z` is a normalized camera-proximity signal derived from the apparent hand bounding-box diagonal, then smoothed before mapping. It intentionally does not claim metric distance. The default mapping controls the selected track's filter-modulation depth.

Palm-facing and three-axis rotation are geometric estimates derived from MediaPipe landmarks,
not calibrated physical angles. Their normalized values are designed for expressive control and
Gesture Learn, not for biomechanical measurement.
