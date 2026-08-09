# Gesture Stem Workstation

A local-first, gesture-controlled multitrack performance instrument. The current vertical
slice loads pre-separated stems, keeps them on one authoritative transport, visualizes them
with WaveSurfer, applies real-time Web Audio processing, and maps local MediaPipe hand
signals to the selected track.

## What works

- add the four repository example stems without copying or modifying the source WAV files;
- add user-provided WAV, MP3, FLAC, or M4A stems without replacing tracks already in the project, and infer likely track roles;
- clear the complete track list through a dedicated, confirmed action while leaving original audio files unchanged;
- synchronized play, pause, stop, seek, and loop across tracks of unequal duration;
- per-track selection, mute, solo, gain, pan, high-/low-pass, resonance, delay, feedback, and convolution reverb;
- stable left-hand track selection with dwell and hysteresis, plus optional arrow-key selection;
- individual flexion signals for all ten fingers, three-axis rotation for both hands, palm-front/back estimation, camera depth, and two-hand spatial control;
- persistent Finger detail and Classic hands profiles, switchable from the camera panel; Classic hands ignores individual fingers while retaining whole-hand position, openness, velocity, rotation, proximity, and two-hand control;
- gesture-controlled filter modulation, Stutter and Reverse gates, continuously variable Stutter length, and Reverse speed;
- webcam-free synthetic gesture mode for testing and accessibility;
- local browser camera inference without storing or uploading frames;
- versioned JSON project-state export/import;
- local stereo performance capture as WebM/Opus;
- gesture-automation capture/replay, scene capture/recall, and gesture-learn assignment;
- local Basic Pitch jobs, canonical note events, Standard MIDI export, and synchronized browser resynthesis;
- optional Web MIDI CC output for external instruments and DAWs;
- camera performance fullscreen with a transparent, GPU-batched `three.quarks` particle overlay, compact live HUD, and an unobtrusive bottom stem selector;
- high-contrast cyan hand landmarks and skeletal connections;
- a non-disruptive Settings dialog with persistent theme, contrast-safe signal color, spacing density, control-panel width, camera-HUD position, signal-matrix defaults, and a complete Hotkeys tab;
- a compact instrument header, symbol-based transport controls with accessible labels and tooltips, and orthogonal signal-colored sliders;
- experimental saturation, bit reduction, tremolo, feedback freeze, per-track stutter, and reverse playback;
- local FastAPI processor health, immutable hashed uploads, and canonical job states.

The core performance path through the v0.8 plan target is now usable. The first experimental
processors are available as non-destructive per-track state. True granular resynthesis,
FFT-based spectral freeze, OSC, and native-synth work remain
separate follow-up adapters. Stereo capture uses the browser-native WebM/Opus recorder; WAV
export is still a future export adapter.

## Start locally

Requirements: Node.js 22+, npm 10+, Python 3.11+ (3.12 preferred for optional ML
dependencies), FFmpeg, and a current Chrome or Edge.

```bash
./scripts/bootstrap
./scripts/dev
```

Open <http://127.0.0.1:5173>, choose **Add example stems**, then press **Play**. Choose
**Test without camera** for a deterministic gesture source or **Enable camera** for on-device
MediaPipe tracking. The bootstrap downloads the public hand-landmarker model once into the
ignored `models/` directory; subsequent use is local.

The processor listens on `127.0.0.1:8766`. Set `GSW_PROCESSOR_PORT` before `./scripts/dev`
to choose another local port; the web application receives the matching URL automatically.

Optional source-separation dependencies are deliberately not part of the default bootstrap:

```bash
./scripts/bootstrap --with-separation
```

Basic Pitch is installed into a dedicated Python 3.10 environment because its macOS model
runtime has a narrower compatibility window than the FastAPI service:

```bash
./scripts/bootstrap --with-transcription
```

Install both optional processing paths with `./scripts/bootstrap --all`.

## Controls

| Input | Result |
| --- | --- |
| Space | Play/pause |
| M / I | Mute / isolate the selected track |
| L | Toggle the loop |
| S / R | Toggle Stutter / Reverse on the selected track |
| C / N | Capture a scene / activate the next scene |
| F | Enter camera fullscreen; Escape exits |
| Transport symbols | ▶ play, ■ stop, ● mix recording, ◉ gesture recording, ＋ capture scene, → next scene |
| Left hand X | Select track |
| Right index / middle finger | Low-pass / resonance |
| Right thumb / ring / pinky | Delay feedback / delay mix / reverb |
| Right hand roll / pitch / yaw | Pan / high-pass / filter-modulation rate |
| Right hand distance from camera | Filter-modulation depth |
| Left thumb / index / middle finger | Delay time / Stutter length / Reverse speed |
| Left ring / pinky finger | Saturation / bit depth |
| Left hand roll / pitch / yaw | Gain / tremolo depth / tremolo rate |
| Left palm back/front | Stutter on/off with hysteresis |
| Right palm back/front | Reverse on/off with hysteresis |
| Distance between hands | Original-to-synth morph on transcribed tracks |
| Optional arrow keys | Previous/next track |
| Mouse/keyboard controls | Equivalent access to all critical actions |

When arrow-key track selection is enabled, keyboard navigation temporarily becomes the sole
track-selection authority. Gesture-driven effects remain active, but `left.x` cannot overwrite
the selected track until arrow-key mode is disabled again.

Open **Settings** in the project header to adjust the workspace without reordering the
instrument. These preferences are stored locally on the current device and are deliberately
kept separate from exported project JSON. The signal-color picker preserves the technical
black/white control hierarchy and automatically corrects colors that would be unreadable in
the selected theme. Every preset applies immediately through explicit option buttons. If the
browser blocks local storage, the visual change still takes effect and the dialog reports that
it could not be saved.

The **Hotkeys** tab lists every application shortcut. Hotkeys can be disabled globally or
configured to require Shift. They never run while a text field, numeric field, select, or
editable element has focus. The optional arrow-key track selection remains separately
switchable in the selected-track panel.

**Add stems** and **Add example stems** always append to the current project. Existing
tracks, their selection, decoded audio, and waveform displays remain connected. **Clear track
list** is the only track-list action that removes them and requires confirmation first. Loading
a saved project remains a separate replacement operation.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run check:processor
npm run check:ui
```

`check:ui` runs the validator supplied by the required local `tech-ui-designsystem` skill.
The end-to-end suite loads and decodes all four example stems in a real Chromium browser.

## Architecture

- `packages/project-schema`: serializable project state and schema versioning.
- `packages/gesture-domain`: control-source interfaces, transforms, curves, and smoothing.
- `packages/music-domain`: normalized audio parameter descriptors.
- `packages/protocol`: typed browser/processor contracts and canonical job states.
- `apps/web/src/transport`: the sole transport authority.
- `apps/web/src/audio`: runtime audio nodes and recording; never persisted in project state.
- `apps/web/src/gestures`: MediaPipe adapter and mapping engine.
- `packages/gesture-domain`: pure landmark geometry for individual finger flexion, fingertip positions, palm orientation, hand rotation, velocity, and two-hand relations.
- `apps/web/src/visualization`: a Three.js/three.quarks adapter that turns gesture and track state into transparent, role-specific particle effects without owning musical state.
- `apps/processor`: local FastAPI service, safe asset storage, job contracts, and ML adapters.

Original audio is immutable. Runtime objects are held by engine registries, while exported
project data contains only serializable state. See `docs/decisions/` for accepted decisions.
