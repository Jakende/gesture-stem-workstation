# AGENTS.md

# Gesture Stem Workstation — Agent Engineering Guide

## 1. Purpose of this document

This file defines the engineering rules, architectural boundaries, development workflow,
quality requirements, and decision-making constraints for all human developers and coding
agents working on this repository.

Read this document before making architectural changes.

The goal is not merely to make code compile.

The goal is to preserve a coherent real-time musical instrument whose major subsystems can
evolve independently without turning the project into a tightly coupled collection of
third-party repositories.

---

# 2. Project identity

Project working name:

`gesture-stem-workstation`

The application is a gesture-controlled music workstation that allows a user to:

1. upload a complete audio mix;
2. upload already-separated stems;
3. automatically separate a mix into stems;
4. analyze melodic stems;
5. optionally convert melodic material into MIDI/note events;
6. display all tracks on a synchronized multitrack timeline;
7. manipulate tracks with hand gestures captured by a webcam;
8. process original audio in real time;
9. resynthesize MIDI-derived material;
10. morph between source audio and synthesized versions;
11. loop, mute, solo, filter, pitch-shift, spatialize, and effect tracks;
12. record a gesture-driven performance;
13. export the resulting audio and project state;
14. optionally send MIDI to an external DAW or synthesizer.

This repository is therefore not primarily:

- a DAW;
- a stem separator;
- a synthesizer;
- a webcam toy;
- an AI music generator.

It is a performance instrument that connects those capabilities.

---

# 3. Final architectural decision

The project SHALL be implemented as a new monorepo.

Do not build the product as a thin wrapper around one existing repository.

Do not merge several upstream repositories wholesale into one codebase.

Third-party projects are treated as:

- dependencies;
- external services;
- architectural references;
- selectively adapted implementations.

The primary architecture is:

```text
                         ┌──────────────────────┐
                         │      Webcam          │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │  Gesture Tracking    │
                         │    MediaPipe         │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Gesture Mapping      │
                         │      Engine          │
                         └──────┬───────┬───────┘
                                │       │
                        realtime│       │commands
                                │       │
                                ▼       ▼
┌───────────┐        ┌──────────────────────────────┐
│ Uploads   │───────►│       Project Engine         │
└───────────┘        └──────────────┬───────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
                ▼                   ▼                   ▼
        ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
        │ Audio Engine │    │ Timeline/UI  │    │ MIDI Engine  │
        │   Tone.js    │    │ WaveSurfer   │    │ Web MIDI     │
        └──────┬───────┘    └──────────────┘    └──────────────┘
               │
               ▼
        ┌──────────────┐
        │ Audio Output │
        └──────────────┘


       asynchronous analysis / preprocessing
                         │
                         ▼
             ┌──────────────────────┐
             │ Python Worker API    │
             └──────┬────────┬──────┘
                    │        │
                    ▼        ▼
             Stem Separation  Audio→MIDI
```

---

# 4. Reference repositories

The following upstream repositories inform or provide parts of the system.

## 4.1 Gesture interaction reference

Repository:

`coreylallojr/theremix`

Primary concepts to reuse or adapt:

- MediaPipe hand tracking;
- two-hand interaction;
- continuous gesture parameters;
- hand openness;
- pinch detection;
- hand position normalization;
- gesture smoothing;
- Web MIDI;
- Tone.js integration concepts;
- camera configuration;
- on-device inference.

Do NOT assume the entire Theremix application architecture should be retained.

Extract concepts into our own interfaces.

---

## 4.2 Stem separation

Repository:

`nomadkaraoke/python-audio-separator`

Purpose:

- source separation;
- multiple model backends;
- generation of stems from uploaded full mixes.

It should be used behind our own adapter.

Application code must not directly depend on its CLI semantics.

Create an interface such as:

```python
class StemSeparator:
    async def separate(
        self,
        input_path: Path,
        profile: SeparationProfile
    ) -> SeparationResult:
        ...
```

---

## 4.3 Audio-to-MIDI

Repository:

`spotify/basic-pitch`

Purpose:

- note transcription;
- pitch detection;
- pitch-bend information;
- conversion of melodic audio into machine-readable musical events.

It must also be wrapped behind an application-specific adapter.

---

## 4.4 Waveform/timeline

Repository:

`katspaugh/wavesurfer.js`

Purpose:

- waveform visualization;
- timeline navigation;
- regions;
- synchronized track representation.

WaveSurfer is a visualization and navigation layer.

It SHALL NOT become the canonical source of transport state.

Our transport engine owns time.

---

# 5. Intentionally excluded from the core

The JUCE-based `TTeuber/GestureSynth` is not part of the core repository.

Reasons:

1. different runtime architecture;
2. native plugin toolchain;
3. AGPL licensing implications;
4. unnecessary coupling between gesture tracking and synthesis;
5. external MIDI control is a cleaner integration boundary.

A native synthesizer may later be controlled via:

- Web MIDI;
- virtual MIDI port;
- OSC bridge;
- plugin host integration;
- standalone bridge application.

Do not copy AGPL source into this repository without an explicit licensing decision.

---

# 6. Licensing policy

Before introducing a dependency, verify its license.

Preferred licenses:

- MIT;
- BSD;
- Apache-2.0;
- ISC.

Dependencies with strong copyleft requirements must not be incorporated directly into the
core source tree without explicit review.

Record dependency licenses in:

`THIRD_PARTY_NOTICES.md`

Do not remove upstream copyright notices.

Do not copy third-party code without attribution where required.

---

# 7. Product philosophy

The application should feel like a musical instrument.

It must prioritize:

1. low interaction latency;
2. predictability;
3. expressive continuous control;
4. recoverability;
5. visual feedback;
6. local privacy;
7. non-destructive editing.

Musical interaction should not depend on remote inference where avoidable.

Gesture tracking should execute locally on-device.

Stem processing may happen in the local Python worker.

---

# 8. Local-first requirement

Default mode:

```text
Browser UI
   +
localhost Python worker
   +
local project files
```

User audio must not be uploaded to an external cloud service by default.

Any future cloud feature MUST be opt-in.

---

# 9. Repository structure

Preferred structure:

```text
gesture-stem-workstation/
│
├── AGENTS.md
├── PLANS.md
├── README.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── audio/
│   │   │   ├── gestures/
│   │   │   ├── midi/
│   │   │   ├── project/
│   │   │   ├── timeline/
│   │   │   ├── transport/
│   │   │   ├── recording/
│   │   │   ├── visualization/
│   │   │   └── workers/
│   │   │
│   │   ├── public/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── processor/
│       ├── src/
│       │   ├── api/
│       │   ├── analysis/
│       │   ├── separation/
│       │   ├── transcription/
│       │   ├── storage/
│       │   └── jobs/
│       │
│       ├── tests/
│       └── pyproject.toml
│
├── packages/
│   ├── protocol/
│   ├── project-schema/
│   ├── music-domain/
│   └── gesture-domain/
│
├── models/
│   └── .gitkeep
│
├── examples/
│
├── scripts/
│
└── docs/
    ├── architecture/
    ├── gestures/
    ├── audio/
    └── decisions/
```

---

# 10. Frontend technology

Default frontend stack:

- TypeScript;
- Vite;
- Web Audio API;
- Tone.js;
- MediaPipe Tasks Vision;
- wavesurfer.js;
- Web MIDI API.

Do not introduce a frontend framework merely for convenience.

If a UI framework becomes necessary, record the decision in an ADR before adoption.

The first implementation should favor:

- TypeScript modules;
- explicit state stores;
- typed event buses;
- small UI components;
- minimal runtime complexity.

---

# 11. Python processing service

The Python application is responsible for operations that are:

- computationally expensive;
- asynchronous;
- ML-based;
- inappropriate for the browser.

Examples:

- stem separation;
- audio transcription;
- waveform preprocessing;
- BPM estimation;
- key estimation;
- spectral feature extraction;
- caching model outputs.

Preferred API style:

```text
POST /projects/{id}/assets
POST /jobs/separate
POST /jobs/transcribe
GET  /jobs/{id}
GET  /projects/{id}/analysis
```

Long-running operations must use jobs.

Never keep an HTTP request open for several minutes waiting for model inference.

---

# 12. Project model

Every musical session is a project.

Minimum project representation:

```ts
interface Project {
  id: string;
  version: number;
  name: string;

  sampleRate: number;

  tempo?: number;
  musicalKey?: string;

  tracks: Track[];
  mappings: GestureMapping[];
  scenes: Scene[];
}
```

Track:

```ts
interface Track {
  id: string;
  name: string;

  role:
    | "vocals"
    | "bass"
    | "drums"
    | "melody"
    | "other"
    | "custom";

  sourceAssetId: string;

  audioState: AudioTrackState;

  transcription?: TranscriptionReference;

  synth?: SynthTrackState;

  routing: TrackRouting;
}
```

---

# 13. Non-destructive audio architecture

Original uploaded audio is immutable.

Never overwrite:

```text
source.wav
```

Derived data should be separate:

```text
assets/
  original/
  stems/
  renders/
  previews/
  analysis/
  midi/
```

All manipulations are represented as state.

Examples:

- gain;
- pan;
- filter;
- pitch;
- loop;
- trim;
- mute;
- effects;
- resynthesis ratio.

---

# 14. Audio + resynthesis architecture

A melodic track may have two simultaneous signal paths:

```text
                    ┌── Original Audio ── FX ──┐
Track ──────────────┤                           ├── Crossfade ── Output
                    └── MIDI → Synth ── FX ─────┘
```

The user may continuously morph between them.

Define:

```ts
interface ResynthesisState {
  enabled: boolean;
  mix: number; // 0 original, 1 synthesized
}
```

This parameter MUST be gesture-mappable.

---

# 15. Transport authority

There must be exactly one authoritative transport.

Transport owns:

- current time;
- play;
- pause;
- seek;
- BPM;
- loop region;
- scheduling origin.

WaveSurfer follows transport.

Tone.js scheduling follows transport.

Visualizers follow transport.

No module may independently invent playback time.

---

# 16. Gesture architecture

Do not wire MediaPipe directly to audio parameters.

Required layers:

```text
MediaPipe landmarks
        ↓
Feature Extraction
        ↓
Gesture State
        ↓
Gesture Mapping Engine
        ↓
Parameter Automation
        ↓
Audio / Transport / Track command
```

---

# 17. Gesture features

Core continuous features:

```text
left.x
left.y
left.z

right.x
right.y
right.z

left.openness
right.openness

left.pinch
right.pinch

left.rotation
right.rotation

hands.distance

left.velocity.x
left.velocity.y

right.velocity.x
right.velocity.y
```

Core discrete gestures:

```text
open-hand
fist
pinch
point
two-fingers
three-fingers
four-fingers
swipe-left
swipe-right
swipe-up
swipe-down
```

Do not build critical controls around unreliable classifiers.

Continuous features are preferred for expressive musical modulation.

---

# 18. Gesture smoothing

Raw computer-vision landmarks are noisy.

Every continuous control MUST support:

- normalization;
- smoothing;
- dead zone;
- clamping;
- hysteresis where appropriate;
- sensitivity scaling.

Example:

```ts
interface GestureSignalConfig {
  smoothing: number;
  min: number;
  max: number;
  deadZone?: number;
  invert?: boolean;
  curve?: "linear" | "exp" | "log" | "s";
}
```

Audio parameters must not receive raw landmark coordinates.

---

# 19. Gesture mapping model

Mappings must be data, not hard-coded application logic.

Example:

```json
{
  "id": "mapping-filter",
  "source": "right.y",
  "target": {
    "type": "track-parameter",
    "trackId": "bass",
    "parameter": "filter.cutoff"
  },
  "transform": {
    "inputMin": 0.2,
    "inputMax": 0.8,
    "outputMin": 100,
    "outputMax": 12000,
    "curve": "exp",
    "invert": true
  }
}
```

---

# 20. Gesture learn mode

The application should eventually provide MIDI-learn-like gesture assignment.

Workflow:

```text
1. User selects a parameter.
2. User clicks "Learn Gesture".
3. User moves a hand.
4. System detects dominant input dimension.
5. Candidate mapping appears.
6. User confirms.
```

This is preferred over requiring all mappings to be manually configured.

---

# 21. Default gesture philosophy

Avoid excessive symbolic gestures.

Default controls should use spatial relationships.

Recommended defaults:

```text
right hand vertical      → primary continuous parameter
right hand horizontal    → secondary continuous parameter
pinch                    → modulation depth
hand openness            → gain or wet/dry
distance between hands   → macro / stereo / spatial control
left hand                → track selection/context
right hand               → manipulation
```

---

# 22. Track-selection gesture model

A robust initial design:

```text
left hand = context
right hand = modulation
```

Example:

```text
left hand enters track zone
        ↓
track selected
        ↓
right hand manipulates selected track
```

Avoid relying entirely on finger-count classification for selecting tracks.

Finger gestures may be optional shortcuts.

---

# 23. Audio engine principles

Audio operations must remain real-time safe.

Avoid:

- large allocations during playback;
- synchronous file decoding during playback;
- network requests in audio interaction paths;
- ML inference in audio callbacks;
- blocking filesystem operations during gesture updates.

Heavy work belongs to:

- Web Workers;
- AudioWorklets;
- Python jobs.

---

# 24. Audio parameter interface

Every controllable parameter should expose a normalized control surface.

Example:

```ts
interface AudioParameterDescriptor {
  id: string;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  scale: "linear" | "log" | "exp";
  gestureMappable: boolean;
}
```

Gesture mapping should operate through descriptors rather than directly touching Tone.js
objects.

---

# 25. Initial audio effects

MVP effects:

- gain;
- pan;
- high-pass filter;
- low-pass filter;
- resonance;
- delay;
- feedback;
- reverb;
- pitch;
- playback rate where appropriate.

Later:

- granular processing;
- stutter;
- spectral freezing;
- formant manipulation;
- convolution;
- sidechain modulation;
- beat repeat.

---

# 26. Stem separation workflow

Input:

```text
song.wav
```

Processing:

```text
song.wav
   ↓
separator
   ↓
vocals.wav
bass.wav
drums.wav
other.wav
```

Result metadata:

```json
{
  "sourceAssetId": "...",
  "model": "...",
  "createdAt": "...",
  "stems": {
    "vocals": "...",
    "bass": "...",
    "drums": "...",
    "other": "..."
  }
}
```

Separation output must be cached.

Do not recompute stems unless:

- model changes;
- separation settings change;
- source hash changes;
- user explicitly requests regeneration.

---

# 27. Pre-separated input workflow

Users may upload:

```text
melody.wav
bass.wav
drums.wav
vocals.wav
```

Do not force these through source separation.

The import UI should permit assigning each file a role.

---

# 28. Transcription workflow

Transcription is optional.

Recommended candidates:

- melody;
- bass;
- vocals when pitch-derived control is wanted;
- isolated harmonic content.

Avoid automatically transcribing drum stems with Basic Pitch.

Output should include:

```text
notes
velocity
start time
duration
pitch bend where available
confidence
```

---

# 29. MIDI representation

Canonical note data should be stored in our own schema.

Do not make `.mid` files the only internal representation.

Example:

```ts
interface NoteEvent {
  id: string;
  pitch: number;
  velocity: number;
  startSeconds: number;
  durationSeconds: number;
  pitchBends?: PitchBendPoint[];
}
```

A MIDI file can be exported from this representation.

---

# 30. Synthesizer strategy

The initial synthesizer should live inside the web audio engine.

Do not begin by implementing a complex native JUCE synth.

MVP synth:

- polyphonic oscillator;
- oscillator type selection;
- ADSR;
- filter;
- filter envelope;
- LFO;
- velocity response;
- pitch bend;
- delay;
- reverb.

Resynthesis value matters more than analog-modeling sophistication.

---

# 31. External MIDI

Support Web MIDI as an optional output.

Possible routing:

```text
gesture-stem-workstation
        ↓
virtual MIDI port
        ↓
Ableton / Bitwig / Logic / Reaper
        ↓
external VST
```

External MIDI is an integration boundary, not the application's internal control protocol.

---

# 32. Audio recording

Performance recording must be separate from editing state.

Two recording modes are desirable:

## Mix recording

Record final stereo output.

## Automation recording

Record gesture-generated parameter changes.

Example:

```ts
interface AutomationPoint {
  time: number;
  value: number;
}
```

Automation recording allows a gesture performance to be replayed and edited.

---

# 33. Scenes

A scene captures performance state.

Example:

```text
Scene A
- bass original 70%
- melody synth 100%
- drums normal
- reverb medium

Scene B
- bass synth 100%
- melody muted
- drums filtered
- reverb high
```

Gestures may switch or morph scenes.

---

# 34. Threading and worker rules

Frontend:

Main UI thread SHOULD NOT perform:

- stem analysis;
- large waveform processing;
- heavy FFT processing;
- model inference.

Use:

- Web Workers;
- AudioWorklets;
- local Python worker.

---

# 35. API boundaries

Browser and processor communicate through explicit typed contracts.

Do not send arbitrary dictionaries.

Maintain shared protocol definitions.

Example response:

```json
{
  "jobId": "job_123",
  "type": "stem-separation",
  "status": "running",
  "progress": 0.43
}
```

---

# 36. Job states

Allowed processing states:

```text
queued
running
completed
failed
cancelled
```

Do not invent module-specific status strings.

---

# 37. Error handling

Errors must be actionable.

Bad:

```text
Processing failed.
```

Good:

```text
Stem separation could not start because FFmpeg was not found.
Install FFmpeg or configure its executable path in Settings.
```

Store diagnostic information separately from user-facing messages.

---

# 38. Project persistence

Project state must be serializable.

Never store non-serializable runtime objects inside persisted state.

Bad:

```ts
project.track.player = new Tone.Player(...)
```

Good:

```ts
project.track.playerState = {
  assetId: "...",
  gain: 0.8
}
```

Runtime instances belong to engine registries.

---

# 39. Project schema versioning

Every project must contain a schema version.

Example:

```json
{
  "schemaVersion": 1
}
```

Breaking changes require migration code.

Never silently reinterpret old project state.

---

# 40. Asset identity

Assets should use content hashes.

Example:

```text
sha256(audio file)
```

Benefits:

- deduplication;
- cache validation;
- analysis reuse;
- deterministic project references.

---

# 41. Privacy

Camera frames remain local.

Do not record camera footage unless explicitly enabled.

Do not persist raw hand video.

Persist gesture automation only when requested.

Audio stays local by default.

---

# 42. Security

Uploaded files are untrusted input.

Backend must:

- validate paths;
- reject path traversal;
- restrict output directories;
- limit upload sizes;
- validate file types;
- never execute filenames as shell fragments;
- use subprocess argument arrays rather than shell concatenation.

Bad:

```python
os.system(f"ffmpeg -i {filename} ...")
```

Preferred:

```python
subprocess.run([
    "ffmpeg",
    "-i",
    str(input_path),
    ...
], check=True)
```

---

# 43. Performance budgets

Targets for the interactive path:

Gesture visual update:

```text
>= 30 FPS
```

Preferred:

```text
60 FPS
```

Gesture-to-parameter latency:

```text
target < 50 ms
```

Audio dropout:

```text
0 tolerated during normal interaction
```

Do not optimize offline ML processing at the expense of real-time interaction quality.

---

# 44. Testing strategy

Tests are required at four levels.

## Unit tests

Examples:

- gesture normalization;
- gesture smoothing;
- mapping curves;
- transport calculations;
- note transforms;
- project migrations.

## Integration tests

Examples:

```text
upload → project asset
mix → separation job → stems
stem → transcription → notes
gesture → mapping → parameter
```

## Browser tests

Examples:

- timeline synchronization;
- track mute/solo;
- project load/save;
- gesture learn mode using synthetic gesture data.

## Audio regression tests

Where deterministic:

- parameter scheduling;
- transport timing;
- offline rendered signal properties.

---

# 45. Gesture tests must not require a webcam

Provide synthetic gesture sources.

Example:

```ts
interface GestureSource {
  subscribe(callback: (frame: GestureFrame) => void): Unsubscribe;
}
```

Implement:

```text
MediaPipeGestureSource
SyntheticGestureSource
RecordedGestureSource
```

This makes gesture logic testable.

---

# 46. ML adapter testing

Do not run heavyweight models in every unit-test suite.

Use adapter mocks for regular tests.

Have separate optional integration tests for:

- actual source separation;
- actual Basic Pitch transcription.

---

# 47. Coding conventions — TypeScript

Requirements:

- strict mode enabled;
- no implicit `any`;
- prefer discriminated unions;
- avoid global mutable state;
- use explicit domain names;
- prefer composition over inheritance.

Avoid:

```ts
const data: any = ...
```

Prefer:

```ts
const result: SeparationJobResult = ...
```

---

# 48. Coding conventions — Python

Requirements:

- type hints;
- pathlib;
- dataclasses or typed models;
- structured logging;
- no shell interpolation;
- deterministic filesystem paths;
- dependency injection for model adapters.

Use async APIs only where concurrency has actual value.

Do not make CPU-bound model inference magically asynchronous by wrapping everything in
`async def`.

Use worker/process execution where appropriate.

---

# 49. Naming

Prefer domain-specific names.

Good:

```text
GestureMapping
TrackAudioEngine
StemSeparationJob
ProjectTransport
ResynthesisMixer
```

Bad:

```text
Manager
Helper
Utils2
Stuff
HandlerThing
```

`utils` directories should be rare.

---

# 50. Module boundaries

A module may depend inward on domain interfaces.

Example:

```text
MediaPipe adapter
       ↓
gesture-domain
       ↓
mapping engine
       ↓
audio parameter port
       ↓
Tone.js adapter
```

Domain logic should not import MediaPipe or Tone.js directly.

---

# 51. Dependency direction

Preferred:

```text
UI
↓
Application
↓
Domain
↑
Adapters
```

Third-party libraries belong primarily in adapters.

---

# 52. No giant event bus

Do not route the entire application through stringly typed events such as:

```text
"THING_CHANGED"
"UPDATE"
"REFRESH_AUDIO"
```

If an event system is used, events must be typed.

---

# 53. State ownership

Each important concept has one owner.

Examples:

```text
Transport state       → TransportEngine
Project state         → ProjectStore
Gesture raw state     → GestureEngine
Mapping definitions   → MappingStore
Audio runtime         → AudioEngine
Processing jobs       → ProcessorClient
```

Avoid duplicated state.

---

# 54. Logging

Logs should include:

```text
timestamp
module
event
project id
job id where applicable
severity
```

Do not continuously log gesture frames in production.

---

# 55. Feature flags

Experimental audio processors should sit behind feature flags.

Example:

```text
experimental.granular
experimental.spectralFreeze
experimental.poseTracking
```

Do not destabilize the primary performance path.

---

# 56. Accessibility

Gesture control must never be the only way to operate essential functionality.

Every critical gesture action must have:

- mouse/touch equivalent;
- keyboard equivalent where reasonable.

Users need a way to recover if gesture detection fails.

---

# 57. Calibration

Gesture input requires calibration.

At minimum allow:

- camera selection;
- mirroring;
- confidence threshold;
- smoothing;
- active hand;
- interaction region;
- minimum and maximum control bounds.

Calibration state may be stored locally per device.

---

# 58. First-run experience

First run should guide the user through:

```text
1. Audio permissions.
2. Camera permission.
3. Hand detection.
4. Select or upload audio.
5. Assign first gesture.
6. Play.
```

Do not begin with a complex routing matrix.

---

# 59. UI principles

Prioritize:

- tracks;
- current selected track;
- playback state;
- gesture target;
- active parameter;
- hand feedback.

The user must always know:

```text
Which track am I controlling?
Which parameter am I controlling?
What value is being sent?
```

---

# 60. Visual gesture feedback

Show:

- detected hands;
- active gesture;
- normalized control value;
- active mapping;
- smoothing state if useful.

Do not expose all 21 MediaPipe landmarks unless in debug mode.

---

# 61. Debug mode

Provide developer overlays for:

- raw landmarks;
- gesture features;
- mapped values;
- audio parameter values;
- FPS;
- gesture latency;
- audio timing drift.

Debug UI should be removable from normal performance mode.

---

# 62. MVP definition

MVP is complete when a user can:

1. launch the application locally;
2. upload one audio file;
3. split it into at least four stems;
4. view stems on synchronized tracks;
5. play all tracks in sync;
6. enable webcam tracking;
7. select a track;
8. control at least two audio parameters by hand;
9. mute/solo tracks;
10. loop a region;
11. save a project;
12. reload the project;
13. record the final stereo performance.

Audio-to-MIDI is highly desirable but is not required for the first playable vertical slice.

---

# 63. First playable vertical slice

Before implementing every feature, create:

```text
one audio file
        ↓
four stems
        ↓
timeline
        ↓
playback
        ↓
right-hand Y
        ↓
selected track filter cutoff
```

If this interaction is not enjoyable and responsive, adding more ML or DSP will not fix the
product.

---

# 64. Development priorities

Always prioritize:

```text
interaction quality
>
architecture purity
>
feature count
```

while still preserving module boundaries.

---

# 65. Anti-goals

Do not attempt in early versions to build:

- a full Ableton Live replacement;
- piano-roll editing;
- multitrack recording studio functionality;
- VST hosting;
- cloud collaboration;
- generative AI composition;
- automatic mastering;
- social features;
- marketplace infrastructure;
- native mobile applications.

---

# 66. Pull request rules

Every meaningful PR should answer:

```text
What user capability changes?

Which architectural module owns this?

Does this add a new dependency?

Does it affect real-time audio?

Does it affect project persistence?

Does it require migration?

How was it tested?
```

---

# 67. Architecture Decision Records

Major irreversible or expensive decisions require an ADR.

Store under:

```text
docs/decisions/
```

Examples:

```text
0001-monorepo.md
0002-local-python-worker.md
0003-web-audio-engine.md
0004-project-schema.md
0005-gesture-mapping-model.md
```

---

# 68. Agent workflow

When an agent receives a task:

1. read `AGENTS.md`;
2. read relevant sections of `PLANS.md`;
3. inspect existing code before designing replacements;
4. identify the module owning the behavior;
5. search for existing interfaces;
6. implement the smallest coherent change;
7. add or update tests;
8. run applicable checks;
9. update documentation when behavior changes.

Do not create parallel systems for functionality that already exists.

---

# 69. Agent change discipline

Agents must avoid opportunistic unrelated refactors.

A task such as:

```text
Add pinch mapping
```

should not also:

```text
replace the state architecture
rename 40 modules
upgrade unrelated dependencies
rewrite the build system
```

unless explicitly required.

---

# 70. Agent uncertainty policy

When requirements are ambiguous, prefer the interpretation that:

1. preserves existing project data;
2. keeps processing non-destructive;
3. minimizes coupling;
4. keeps gesture latency low;
5. maintains local-first behavior.

Document material assumptions.

---

# 71. Agent third-party code policy

Before copying implementation from an upstream repository:

1. inspect its license;
2. record attribution requirements;
3. prefer dependency usage;
4. prefer adapter interfaces;
5. copy only when necessary;
6. preserve notices.

Do not casually copy code from AGPL/GPL projects.

---

# 72. Required quality commands

The exact package manager may evolve, but the repository should expose root-level commands
equivalent to:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Processor:

```bash
pytest
ruff check .
mypy src
```

A root command should eventually run all relevant checks.

---

# 73. Definition of done

A task is done when:

- implementation exists;
- relevant tests pass;
- no new type errors exist;
- no obvious performance regression exists;
- user-visible errors are meaningful;
- project persistence still works if affected;
- documentation is updated if needed;
- no accidental license conflict was introduced.

---

# 74. Architectural invariant summary

Never violate these without an explicit ADR:

```text
1. The project is a new monorepo.
2. Original audio is immutable.
3. Processing is non-destructive.
4. Gesture recognition is separate from gesture mapping.
5. Gesture mapping is separate from audio implementation.
6. Transport has one authority.
7. Heavy ML work runs outside the real-time browser path.
8. Third-party ML tools are wrapped in adapters.
9. Project state is serializable and versioned.
10. Local-first is the default.
11. External synths integrate through protocols rather than source-code coupling.
12. Gesture interaction must remain testable without a webcam.
```

---

# 75. Core product sentence

When unsure whether a feature belongs in this repository, evaluate it against this sentence:

> Gesture Stem Workstation transforms existing audio into a playable, remixable,
> resynthesizable instrument that can be performed with hand movement in real time.

If a feature does not meaningfully support that goal, it is probably not a priority.
