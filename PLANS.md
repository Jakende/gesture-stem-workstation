# PLANS.md

# Gesture Stem Workstation — Product and Engineering Plan

## 1. Vision

Build an open, forkable, local-first workstation in which existing music becomes a
gesture-controlled instrument.

The user should be able to take:

```text
song.wav
```

or:

```text
vocals.wav
bass.wav
melody.wav
drums.wav
```

and transform those files into a live performance environment.

The defining interaction is not clicking automation lanes.

The defining interaction is:

```text
move hand
    ↓
music changes immediately
```

The application combines:

- stem separation;
- waveform playback;
- track-based remixing;
- audio analysis;
- audio-to-MIDI transcription;
- synthesis;
- effects;
- looping;
- gesture mapping;
- webcam hand tracking;
- performance recording.

---

# 2. Final product decision

We will build:

```text
gesture-stem-workstation
```

as a new monorepo.

Primary deployment:

```text
Local browser application
+
Local Python processing service
```

Primary runtime architecture:

```text
Webcam
  ↓
MediaPipe
  ↓
Gesture Engine
  ↓
Gesture Mapping
  ↓
Track / Synth / FX parameters

Uploaded Audio
  ↓
Python Processor
  ├── Stem Separation
  └── Audio-to-MIDI
  ↓
Project Assets
  ↓
Browser Audio Engine
  ↓
Live Performance
```

---

# 3. Why this option was selected

## Alternative A — Fork Theremix only

Rejected as final architecture.

Advantages:

- very fast start;
- gesture tracking already implemented;
- browser audio already present.

Problems:

- designed around its own musical interaction;
- no mature multitrack project model;
- no stem-separation architecture;
- no general audio-analysis pipeline;
- no reusable project/asset model.

Theremix remains a valuable interaction reference.

---

## Alternative B — Build around native JUCE GestureSynth

Rejected for core version.

Advantages:

- sophisticated synth architecture;
- native plugin formats;
- mature modulation possibilities.

Problems:

- no camera hand tracking;
- different build ecosystem;
- browser UI integration becomes complex;
- AGPL implications;
- unnecessarily constrains architecture.

External MIDI integration may be added later.

---

## Alternative C — New integrated workstation

Selected.

Advantages:

- clean architecture;
- fork-friendly;
- independent module evolution;
- local-first;
- browser webcam support;
- Python ML ecosystem;
- easier contribution model;
- avoids coupling third-party source trees together;
- permits future DAW or hardware integration.

---

# 4. Upstream components

Initial upstream ecosystem:

```text
coreylallojr/theremix
    → gesture interaction reference

nomadkaraoke/python-audio-separator
    → source separation

spotify/basic-pitch
    → audio-to-MIDI

katspaugh/wavesurfer.js
    → waveform/timeline
```

Optional technologies:

```text
Tone.js
MediaPipe Tasks Vision
Web Audio API
Web MIDI API
FFmpeg
```

---

# 5. Product principles

## 5.1 Performance first

The application must feel immediate.

The user should experience the gesture layer as an instrument rather than a remote control.

---

## 5.2 Non-destructive

Source audio is never overwritten.

---

## 5.3 Local-first

Camera processing and project audio remain local by default.

---

## 5.4 Modularity

Stem separation should be replaceable.

Transcription should be replaceable.

Gesture detection should be replaceable.

Audio engine should be replaceable.

---

## 5.5 User-defined mapping

The application should eventually allow the user to map almost any gesture signal to almost
any eligible parameter.

---

# 6. Product modes

The product has four conceptual modes.

```text
IMPORT
ANALYZE
PERFORM
RECORD
```

These may eventually become visible UI modes, but the architectural distinction should exist
from the beginning.

---

# 7. Import mode

Users can import either:

## Single mix

```text
song.wav
```

Supported initial formats:

```text
WAV
MP3
FLAC
M4A where decoding permits
```

## Pre-separated stems

```text
bass.wav
drums.wav
melody.wav
vocals.wav
```

Files may be manually assigned roles.

---

# 8. Analyze mode

Possible analysis jobs:

```text
stem separation
BPM detection
key detection
audio-to-MIDI
waveform peak generation
duration extraction
loudness analysis
```

Jobs should be explicit and cancellable.

---

# 9. Perform mode

Perform mode focuses on:

```text
playback
track selection
gesture control
looping
mixing
effects
resynthesis
scene changes
```

This mode should minimize unnecessary UI complexity.

---

# 10. Record mode

Two forms:

```text
audio recording
automation recording
```

Later:

```text
MIDI recording
```

---

# 11. Phase overview

```text
Phase 0  Repository foundation
Phase 1  Multitrack audio playback
Phase 2  Stem separation
Phase 3  Gesture tracking
Phase 4  Gesture mapping
Phase 5  Performance workflow
Phase 6  Audio-to-MIDI
Phase 7  Resynthesis
Phase 8  Recording/export
Phase 9  Advanced performance features
Phase 10 External integrations
```

---

# 12. Phase 0 — Repository foundation

Goal:

Create a maintainable skeleton before implementing product complexity.

Deliverables:

```text
monorepo
web application
Python processor
shared protocol
test setup
linting
formatting
CI
```

Suggested tree:

```text
apps/web
apps/processor
packages/protocol
packages/project-schema
packages/gesture-domain
packages/music-domain
```

Tasks:

- initialize Git repository;
- choose package manager;
- configure TypeScript strict mode;
- configure Vite;
- configure Python environment;
- configure pytest;
- configure linting;
- configure type checking;
- add root development scripts;
- add AGENTS.md;
- add PLANS.md;
- add license;
- add third-party notices;
- create initial ADRs.

Completion criteria:

```text
web dev server starts
processor starts
tests run
CI passes
browser can health-check processor
```

---

# 13. Phase 1 — Multitrack audio engine

Goal:

Create reliable synchronized playback before introducing gestures or AI.

User can:

```text
upload 2–4 audio tracks
see waveforms
play
pause
seek
mute
solo
change volume
loop
```

Architecture:

```text
ProjectTransport
    ↓
TrackAudioEngine
    ↓
Tone/WebAudio players
```

WaveSurfer is visualization only.

Tasks:

- asset import;
- audio decoding;
- project track creation;
- waveform visualization;
- synchronized playback;
- volume;
- mute;
- solo;
- pan;
- transport loop;
- seek;
- track naming;
- project save/load.

Exit criteria:

Playback remains synchronized through:

```text
play
pause
seek
loop
mute
solo
```

for a 10-minute multitrack project.

Implementation status (2026-08-09): pre-separated intake is additive. Add stems and Add
example stems create only new assets, track state, AudioEngine runtimes, and Waveform views;
they preserve every existing track and the current selection. Hash-identical user files reuse
their immutable asset identity. Clearing is a separate confirmed action that removes the track
list, scenes, and recorded automation without touching source audio. Loading a saved project
remains the intentional replacement path.

---

# 14. Phase 2 — Stem separation

Goal:

A user uploads one song and receives usable tracks.

Workflow:

```text
Upload
   ↓
Create source asset
   ↓
Submit separation job
   ↓
Process
   ↓
Generate stems
   ↓
Import generated stems as tracks
```

Initial output:

```text
vocals
drums
bass
other
```

Tasks:

- integrate `python-audio-separator`;
- create separator adapter;
- add model configuration;
- add processing jobs;
- expose progress;
- provide cancellation;
- persist results;
- hash input;
- cache separation output;
- add retry path;
- show user-friendly failure errors.

Exit criteria:

User can upload a full song and reach synchronized stem playback without manually moving
files.

---

# 15. Phase 3 — Gesture tracking

Goal:

Convert webcam movement into stable musical control signals.

First implementation:

```text
MediaPipe Hand Landmarker
```

Required outputs:

```text
right.x
right.y
right.openness
right.pinch

left.x
left.y
left.openness
left.pinch

hands.distance
```

Tasks:

- camera selection;
- camera mirror support;
- hand identification;
- normalization;
- smoothing;
- calibration;
- confidence handling;
- debug visualization;
- synthetic gesture input;
- recorded gesture fixture support.

Exit criteria:

Gesture signals are stable enough to control a UI slider without unacceptable jitter.

Implementation status (2026-08-09): the expanded signal extraction is complete. In addition
to the original outputs, the domain now exposes all ten finger-flexion signals, normalized
fingertip positions, roll/pitch/yaw, palm-facing, velocity, camera proximity, and two-hand
relations. Pure landmark fixtures cover the geometry without requiring a webcam. Camera
selection, a full calibration wizard, and recorded gesture fixtures remain open tasks. The UI
now exposes persistent Finger detail and Classic hands profiles. The classic profile ignores
individual finger features at both mapping and Gesture Learn boundaries while retaining the
whole-hand signals. Both profiles use distinct visible signal matrices and can be switched
without stopping the active camera or synthetic source.

---

# 16. Phase 4 — Gesture mapping engine

Goal:

Separate physical input from application behavior.

Initial mapping targets:

```text
track.volume
track.pan
track.filter.cutoff
track.filter.resonance
track.reverb.mix
track.delay.mix
track.delay.feedback
transport.loopLength
```

Mapping pipeline:

```text
Gesture Feature
    ↓
Transform
    ↓
Smoothing
    ↓
Range Mapping
    ↓
Target Parameter
```

Tasks:

- mapping schema;
- target parameter registry;
- linear transforms;
- exponential transforms;
- inversion;
- dead zones;
- smoothing;
- enable/disable;
- mapping editor;
- persistence.

Exit criteria:

The same gesture input can be reassigned to different audio parameters without changing
gesture detection code.

Implementation status (2026-08-09): complete for continuous parameters and hysteretic
boolean gates. Stutter and Reverse use separate on/off thresholds; all mappings remain
serializable data and the Gesture Learn workflow accepts the expanded continuous feature set.
A full row-based mapping editor remains open.

---

# 17. Phase 5 — First real musical interaction

This phase is the product validation point.

The first canonical performance layout should be:

```text
LEFT HAND
    ↓
select/control context

RIGHT HAND
    ↓
continuous modulation
```

Recommended initial interaction:

```text
left-hand horizontal position
    → selected track

right-hand vertical position
    → filter cutoff

right-hand pinch
    → resonance

right-hand openness
    → effect wet/dry
```

Alternative selection UI may use screen zones rather than finger-count gestures.

Exit criteria:

A user can perform a 60-second remix without touching the mouse after playback begins.

Implementation status (2026-08-09): the canonical workspace is implemented without changing
the transport, track, inspector, or camera order. Layout preferences now live in a modal,
device-local Settings surface so configuration does not reflow the instrument. Theme,
contrast-safe signal color, 4-pixel-grid spacing density, inspector width, HUD position, and
signal-matrix defaults are persisted independently from project state. A longer musician-led
60-second performance evaluation remains the next qualitative gate.

---

# 18. Phase 6 — Basic Pitch integration

Goal:

Turn melodic audio into note data.

Candidates:

```text
bass
melody
isolated vocals
other harmonic stems
```

Do not automatically send drums through transcription.

Workflow:

```text
Track
 ↓
Transcription Job
 ↓
Note Events
 ↓
Editable/inspectable note representation
 ↓
MIDI export / Synth input
```

Tasks:

- Basic Pitch adapter;
- job API;
- note-event schema;
- pitch bend representation;
- confidence filtering;
- transcription cache;
- MIDI export;
- timeline note overlay.

Exit criteria:

An isolated bass or melody track can generate musically recognizable synchronized MIDI.

---

# 19. Phase 7 — Resynthesis engine

Goal:

Make stems transformable rather than merely effectable.

Architecture:

```text
Track
 ├── original audio path
 └── synthesized MIDI path
          ↓
       crossfade
```

MVP synth:

```text
oscillator
ADSR
filter
filter envelope
LFO
velocity
pitch bend
delay
reverb
```

Critical parameter:

```text
resynthesis.mix
```

Range:

```text
0.0 = original audio
1.0 = synthesized signal
```

This parameter must be gesture-controllable.

Canonical gesture:

```text
hand vertical position
      ↓
original ↔ synth morph
```

Exit criteria:

A melodic stem can be continuously morphed between source audio and a synthesized
representation while remaining synchronized.

---

# 20. Phase 8 — Performance recording

Goal:

Capture what the user performs.

## 20.1 Stereo mix recording

Capture final output.

Export:

```text
WAV
```

Optional later:

```text
FLAC
MP3
```

## 20.2 Gesture automation recording

Record:

```text
parameter
timestamp
value
```

Example:

```json
{
  "parameter": "track:bass:filter.cutoff",
  "points": [
    {
      "time": 12.40,
      "value": 0.21
    },
    {
      "time": 12.46,
      "value": 0.26
    }
  ]
}
```

Benefits:

- replay;
- editing;
- export;
- performance preservation.

Exit criteria:

A gesture performance can be reproduced without needing the webcam.

---

# 21. Phase 9 — Scenes

Goal:

Allow instant transitions between musical states.

A scene captures:

```text
track states
effect states
synth states
resynthesis mix
gesture mapping set
```

Example:

```text
INTRO
DROP
BREAKDOWN
AMBIENT
```

Gesture options:

```text
swipe → next scene
hold gesture → temporary scene
hands distance → interpolate scenes
```

Exit criteria:

Scenes can be recalled without audible synchronization errors.

---

# 22. Phase 10 — Gesture learn

Goal:

Make configuration musician-friendly.

Workflow:

```text
1. Click parameter.
2. Click Learn Gesture.
3. Move hand.
4. System identifies strongest control dimension.
5. Preview appears.
6. User confirms.
```

Potential source detection:

```text
largest normalized variance over calibration window
```

Example:

```text
user primarily moved hand vertically
    ↓
suggest right.y
```

Exit criteria:

A new user can create a useful mapping without editing JSON.

---

# 23. Phase 11 — Advanced audio manipulation

After the core interaction is validated, add processors.

Priority order:

## 23.1 Stutter

Gesture-controlled repeat size.

Example:

```text
pinch distance
    ↓
1 beat
1/2
1/4
1/8
1/16
```

## 23.2 Granular engine

Possible controls:

```text
hand x → grain position
hand y → grain size
pinch → density
rotation → pitch spread
```

## 23.3 Spectral freeze

Example:

```text
fist closes
    ↓
freeze spectrum
```

## 23.4 Reverse buffer

Example:

```text
fast swipe
    ↓
reverse current beat/bar
```

Implementation status (2026-08-09): the experimental rack supports gesture-gated Stutter
and Reverse, continuous Stutter length, and continuous Reverse playback speed. Beat/bar
quantization remains Phase 12 work.

---

# 24. Phase 12 — Beat-aware processing

Goal:

Make destructive-sounding gesture actions remain musically coherent.

Need:

```text
BPM
beat grid
bar position
quantization
```

Actions may snap to:

```text
1 bar
1/2
1/4
1/8
1/16
```

Use for:

- loop changes;
- stutter;
- scene transitions;
- track start/stop;
- resynthesis switching.

---

# 25. Phase 13 — External MIDI

Goal:

Control external software and hardware.

Outputs:

```text
MIDI Note
MIDI CC
Pitch Bend
Aftertouch where available
```

Example:

```text
right.y
    ↓
CC74
    ↓
Ableton
    ↓
external synth cutoff
```

UI should expose MIDI routing separately from internal mappings.

---

# 26. Phase 14 — OSC bridge

Optional.

Use cases:

```text
Max/MSP
Pure Data
SuperCollider
TouchDesigner
custom hardware
native synthesizers
```

Potential architecture:

```text
browser
 ↓ websocket
local bridge
 ↓ OSC
external target
```

Do not add before internal gesture mapping is stable.

---

# 27. Phase 15 — Native synthesizer option

Only evaluate after the web synth/resynthesis workflow proves valuable.

Candidates:

```text
custom JUCE plugin
external open-source synth
user's existing DAW instruments
```

Preferred initial approach:

```text
Web MIDI → external plugin
```

rather than embedding a native plugin host.

---

# 28. Phase 16 — Mapping macros

Goal:

One gesture controls multiple parameters.

Example:

```text
hands.distance
    ↓
macro "EXPAND"
    ├── stereo.width  ↑
    ├── reverb.mix    ↑
    ├── delay.feedback↑
    └── filter.cutoff ↑
```

Macro definition:

```json
{
  "id": "expand",
  "targets": [
    {
      "parameter": "stereo.width",
      "amount": 1
    },
    {
      "parameter": "reverb.mix",
      "amount": 0.6
    }
  ]
}
```

---

# 29. Phase 17 — Mapping layers

A user should eventually be able to switch mapping sets.

Example:

```text
MIX layer
FX layer
SYNTH layer
LOOP layer
```

Left-hand gestures may switch layers.

Right hand retains continuous expression.

---

# 30. Suggested default control system

Initial preset:

## Left hand

```text
horizontal position
→ track selector
```

## Right hand vertical

```text
→ filter cutoff
```

## Right hand horizontal

```text
→ delay feedback
```

## Right pinch

```text
→ resonance
```

## Right openness

```text
→ wet/dry
```

## Distance between hands

```text
→ resynthesis mix
```

This gives six expressive controls without complicated symbolic recognition.

---

# 31. Performance UI concept

Suggested layout:

```text
┌─────────────────────────────────────────────────────┐
│ Transport                                           │
├─────────────────────────────────────────────────────┤
│ Melody  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    │
│ Bass    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    │
│ Drums   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    │
│ Vocals  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    │
├─────────────────────────────┬───────────────────────┤
│ Selected Track              │ Camera / Gesture      │
│                             │                       │
│ Filter      ███████         │     hand overlay      │
│ Resonance   ███             │                       │
│ Reverb      █████           │ Active: filter        │
│ Resynth     ████████        │ Value: 0.71           │
└─────────────────────────────┴───────────────────────┘
```

---

# 32. Performance mode design

Performance mode should hide unnecessary editing controls.

Visible:

```text
transport
tracks
selected track
gesture state
macro parameters
record
scene
```

Hidden or minimized:

```text
file paths
model configuration
debug information
advanced project metadata
```

---

# 33. Edit mode design

Edit mode may expose:

```text
gesture mappings
track roles
synthesis parameters
effects
automation
analysis
separation model settings
```

---

# 34. Processor architecture plan

Suggested Python interfaces:

```python
class AudioProcessor:
    pass
```

Prefer specific interfaces instead:

```python
class StemSeparator:
    def separate(...):
        ...

class Transcriber:
    def transcribe(...):
        ...

class TempoAnalyzer:
    def analyze(...):
        ...

class KeyAnalyzer:
    def analyze(...):
        ...
```

Adapters:

```text
AudioSeparatorStemSeparator
BasicPitchTranscriber
```

---

# 35. Processing job architecture

Example:

```text
JobController
    ↓
JobQueue
    ↓
Worker
    ↓
Adapter
    ↓
Result Store
```

Every job records:

```text
id
type
input asset
configuration
status
progress
created time
started time
completed time
error
result
```

---

# 36. Storage strategy

Initial implementation can use filesystem storage.

Example:

```text
data/
└── projects/
    └── project-id/
        ├── project.json
        ├── assets/
        │   ├── originals/
        │   ├── stems/
        │   ├── midi/
        │   ├── analysis/
        │   └── renders/
        └── cache/
```

A database is not necessary for the first version.

---

# 37. Asset metadata

Example:

```json
{
  "id": "asset_...",
  "sha256": "...",
  "filename": "bass.wav",
  "mimeType": "audio/wav",
  "duration": 218.43,
  "sampleRate": 44100,
  "channels": 2
}
```

---

# 38. Project import workflow

Ideal flow:

```text
Drop song.wav
       ↓
"How should this be imported?"

[ Separate automatically ]
[ Use as one track ]
```

If multiple files:

```text
melody.wav → Melody
bass.wav   → Bass
drums.wav  → Drums
vocals.wav → Vocals
```

Allow role correction.

---

# 39. Stem separation UI

Show:

```text
Analyzing song.wav

Vocals      ████████████ 100%
Bass        ████████████ 100%
Drums       ████████████ 100%
Other       ███████░░░░░  63%
```

Underlying processor may not provide real per-stem progress, so the UI must not invent
false precision.

If only total job progress is available, display total job progress.

---

# 40. Audio-to-MIDI UI

Transcription should be opt-in.

For eligible tracks:

```text
Bass
[ Create MIDI ]

Melody
[ Create MIDI ]
```

Once complete:

```text
Audio
MIDI
Audio + Synth
```

---

# 41. Resynthesis UX

Track control:

```text
SOURCE ◄──────────────► SYNTH
```

Gesture mapping:

```text
hands.distance
      ↓
resynthesis.mix
```

The visual control should continue moving even while controlled by gesture.

---

# 42. Gesture mapping UI

Suggested row:

```text
RIGHT HAND Y
    → Bass / Filter Cutoff
    Curve: Exponential
    Smooth: 0.7
    Range: 180 Hz – 8 kHz
```

Actions:

```text
Edit
Learn
Disable
Delete
```

---

# 43. Gesture calibration UI

Wizard:

```text
Step 1
Hold hands naturally.

Step 2
Move right hand to comfortable lowest position.

Step 3
Move right hand to comfortable highest position.

Step 4
Open and close hand.

Step 5
Perform pinch.
```

Store bounds locally.

---

# 44. Musical timing plan

Transport should support:

```text
seconds
beats
bars
```

Internal audio engine may schedule in seconds, but musical actions should use beat-aware
conversion.

Example:

```ts
transport.secondsToBeats()
transport.beatsToSeconds()
```

---

# 45. Analysis strategy

Do not block MVP on sophisticated music analysis.

Priority:

```text
1. duration
2. waveform
3. stems
4. BPM
5. transcription
6. key
7. advanced features
```

---

# 46. BPM handling

BPM may come from:

- automatic detection;
- manual user input;
- tap tempo.

Manual correction must always be possible.

Never assume estimated BPM is correct.

---

# 47. Key handling

Key detection is advisory.

The user must be able to override:

```text
A minor
C major
etc.
```

Synth resynthesis should not silently transpose user material based on uncertain key
detection.

---

# 48. Early implementation sequence

Recommended engineering order:

```text
1. project schema
2. asset import
3. transport
4. audio playback
5. multitrack waveform
6. project save/load
7. separator service
8. stem import
9. webcam
10. gesture features
11. gesture mapping
12. filter control
13. performance mode
14. transcription
15. synth
16. resynthesis morph
17. recording
```

Do not start with the synthesizer.

---

# 49. First milestone — "It plays"

Definition:

```text
two uploaded tracks
synchronized playback
waveforms
mute
solo
volume
loop
project save/load
```

No gestures.

No ML.

This proves the transport architecture.

---

# 50. Second milestone — "It separates"

Definition:

```text
song.wav
   ↓
four stems
   ↓
tracks automatically appear
   ↓
synchronized playback
```

---

# 51. Third milestone — "It moves"

Definition:

```text
webcam
   ↓
hand Y
   ↓
visual slider
```

No audio control required initially.

---

# 52. Fourth milestone — "It performs"

Definition:

```text
hand Y
   ↓
bass filter cutoff

pinch
   ↓
resonance
```

While all stems stay synchronized.

This is the first true product milestone.

---

# 53. Fifth milestone — "It transforms"

Definition:

```text
melody audio
   ↓
Basic Pitch
   ↓
MIDI
   ↓
Synth
```

User morphs:

```text
original
↔
synthesized
```

with a gesture.

This is the signature feature.

---

# 54. Sixth milestone — "It remembers"

Definition:

Project saves:

```text
tracks
assets
mappings
effects
synth settings
scenes
analysis
```

Reloading reproduces the same state.

---

# 55. Seventh milestone — "It records"

Definition:

User performs for several minutes and exports:

```text
performance.wav
```

Optional:

```text
automation.json
```

---

# 56. Architecture risks

## Risk 1 — Audio synchronization

Multiple independently initialized players may drift.

Mitigation:

```text
one transport
shared scheduling origin
central engine
```

---

## Risk 2 — Gesture jitter

Mitigation:

```text
EMA smoothing
dead zones
hysteresis
calibration
parameter smoothing
```

---

## Risk 3 — Gesture latency

Mitigation:

- local inference;
- minimal main-thread work;
- avoid unnecessary rendering;
- continuous values rather than expensive classifiers.

---

## Risk 4 — Separation runtime

Separation may take significant time.

Mitigation:

```text
background jobs
progress
caching
cancel
```

---

## Risk 5 — Model installation complexity

Mitigation:

- installation script;
- health-check endpoint;
- dependency diagnostics;
- optional model download workflow.

---

## Risk 6 — Browser memory use

Large audio files can consume significant memory.

Mitigation:

- avoid decoding unnecessary assets simultaneously;
- generate previews;
- explore streaming for later versions;
- enforce reasonable file limits initially.

---

## Risk 7 — Licensing

Mitigation:

- dependency license review;
- THIRD_PARTY_NOTICES;
- avoid embedding AGPL code in core;
- keep external synth integration protocol-based.

---

# 57. Product risks

## Too many gestures

A giant symbolic gesture vocabulary is difficult to learn and unreliable.

Prefer:

```text
few gestures
+
continuous modulation
+
context
```

---

## Too much automation

Do not make the system feel like AI is performing instead of the musician.

ML should prepare material.

The human should perform it.

---

## Too much DAW functionality

The product should remain performance-oriented.

---

# 58. Signature interaction

The feature that should define the product:

```text
uploaded melody
      ↓
audio-to-MIDI
      ↓
synthesized duplicate
      ↓
hand movement
      ↓
morph original ↔ synthesis
```

This is more distinctive than simply controlling filter cutoff with a webcam.

---

# 59. Signature multi-track performance

Example:

```text
LEFT HAND:
select bass

RIGHT HAND Y:
filter bass

RIGHT PINCH:
increase resonance

LEFT HAND:
select melody

DISTANCE BETWEEN HANDS:
morph melody into synth

SWIPE:
activate breakdown scene

OPEN HAND:
increase reverb
```

---

# 60. Example project

Input:

```text
track.wav
```

Automatic outputs:

```text
vocals.wav
drums.wav
bass.wav
other.wav
```

User identifies:

```text
other.wav → melody/harmony
```

Transcription:

```text
bass → MIDI
melody → MIDI
```

Runtime:

```text
Drums
  original audio
  filter
  stutter

Bass
  original audio
  synth path
  morph

Melody
  original audio
  synth path
  morph

Vocals
  original audio
  delay
  reverb
  formant later
```

---

# 61. MVP exclusions

Not MVP:

```text
VST hosting
cloud storage
online accounts
collaboration
mobile version
AI song generation
piano-roll editor
full mixer automation editor
plugin marketplace
hardware controller editor
advanced mastering
native JUCE application
```

---

# 62. Version targets

## v0.1 — Audio core

```text
multitrack
timeline
transport
project persistence
```

## v0.2 — Stem engine

```text
automatic separation
```

## v0.3 — Gesture performance

```text
MediaPipe
mapping
filter / volume / FX control
```

## v0.4 — Transcription

```text
Basic Pitch
MIDI export
```

## v0.5 — Resynthesis

```text
synth
audio ↔ synth morph
```

## v0.6 — Performance recording

```text
audio recording
automation capture
```

## v0.7 — Scenes and macros

```text
scenes
multi-parameter gesture macros
```

## v0.8 — Advanced audio

```text
granular
stutter
spectral tools
```

## v0.9 — External ecosystem

```text
MIDI
OSC
DAW workflows
```

## v1.0 — Stable instrument

Requirements:

```text
stable project schema
robust local setup
documented mapping workflow
reliable separation
reliable gesture interaction
recording/export
migration support
reasonable test coverage
```

---

# 63. Success metrics

Technical:

```text
gesture-to-parameter latency < 50 ms target
stable 30+ FPS tracking
no normal playback dropouts
reliable project reload
```

User experience:

A new user should be able to:

```text
upload a song
separate it
press play
enable camera
move a hand
hear a meaningful change
```

without reading developer documentation.

---

# 64. Developer experience goal

A new contributor should be able to run:

```bash
git clone ...
cd gesture-stem-workstation
./scripts/bootstrap
./scripts/dev
```

and receive:

```text
web UI
processor API
dependency diagnostics
```

Avoid undocumented manual setup.

---

# 65. Suggested local development environment

Browser:

```text
Chrome or Edge initially
```

because Web MIDI support matters.

Processor:

```text
Python 3.11+
```

Audio tools:

```text
FFmpeg
```

Frontend:

```text
Node.js LTS
```

Exact versions should be pinned in repository configuration.

---

# 66. CI plan

CI should initially run:

```text
frontend install
frontend lint
frontend typecheck
frontend unit tests
frontend build

Python install
Python lint
Python typecheck
Python tests
```

Heavy ML model integration tests should not run on every PR.

---

# 67. Release strategy

Early releases:

```text
source-first
```

Later consider:

```text
desktop packaging
```

Possible future technologies:

```text
Tauri
Electron
```

Do not adopt desktop packaging until browser + local processor workflow stabilizes.

---

# 68. Future desktop possibility

A desktop shell could eventually provide:

```text
single installation
bundled Python processor
bundled FFmpeg
model management
virtual MIDI integration
filesystem access
```

However, browser-first development minimizes early complexity.

---

# 69. Future hardware possibilities

Possible inputs:

```text
Leap Motion
depth cameras
MIDI controllers
IMU gloves
phones
OSC sensors
```

Gesture mapping architecture should treat these as alternative control sources.

Future abstraction:

```ts
interface ControlSource {
  getSignals(): ControlSignalFrame;
}
```

MediaPipe is only the first source.

---

# 70. Future body tracking

Potential later control:

```text
head movement
shoulders
full pose
face expression
```

Do not add before hand-control UX is strong.

---

# 71. Future collaboration

Potential but low priority:

```text
share project configuration
share gesture mappings
share scenes
```

Raw copyrighted user audio should not become a default collaboration mechanism.

---

# 72. Future preset ecosystem

Users may eventually share:

```text
gesture mapping presets
FX presets
scene presets
synth presets
performance templates
```

Example:

```text
"Ambient Hands"
"DJ Filter"
"Granular Sculpt"
"Stem Conductor"
```

---

# 73. Potential preset categories

```text
Remix
Synth
Ambient
Rhythmic
DJ
Experimental
Accessibility
```

---

# 74. Long-term architecture direction

Eventually:

```text
                  CONTROL SOURCES
              ┌─────────┼──────────┐
              │         │          │
           Webcam      MIDI       OSC
              │         │          │
              └─────────┼──────────┘
                        ↓
                 Mapping Engine
                        ↓
              Parameter Registry
                        ↓
       ┌────────────────┼─────────────────┐
       │                │                 │
    Audio FX         Synths          Transport
       │                │                 │
       └────────────────┼─────────────────┘
                        ↓
                    Renderer
```

This allows the workstation to evolve beyond webcam-specific interaction while preserving
the original product.

---

# 75. Final recommended development sequence

If beginning implementation immediately, follow this exact order:

```text
01  Create monorepo
02  Define project schema
03  Implement asset import
04  Implement single authoritative transport
05  Implement synchronized tracks
06  Add WaveSurfer visualization
07  Save/load project
08  Add Python processor
09  Integrate python-audio-separator
10  Auto-create stem tracks
11  Integrate webcam
12  Build stable gesture feature extraction
13  Build gesture mapping engine
14  Map hand Y → filter cutoff
15  Add track-selection interaction
16  Create dedicated performance mode
17  Integrate Basic Pitch
18  Create internal NoteEvent representation
19  Implement browser synth
20  Implement original/synth crossfade
21  Map gesture → resynthesis morph
22  Implement stereo performance recording
23  Record gesture automation
24  Add scenes
25  Add gesture learn
26  Add macros
27  Add advanced DSP
28  Add MIDI out
29  Add OSC bridge
30  Evaluate desktop packaging
```

---

# 76. The point at which to stop and evaluate

After step 15:

```text
track selection
+
hand-controlled filter
+
automatic stems
```

conduct a serious UX evaluation.

Questions:

```text
Is controlling music this way enjoyable?

Is track selection obvious?

Is latency acceptable?

Does the camera interaction feel stable?

Can a user intentionally reproduce a movement?

Is the system expressive rather than gimmicky?
```

Do not blindly continue adding features if the basic interaction is weak.

---

# 77. Second evaluation gate

After resynthesis morphing is implemented:

```text
original melody
↔
synth melody
```

evaluate whether this becomes the signature interaction.

If successful, prioritize:

```text
better synths
better morphing
better gestural macros
```

over generic DAW features.

---

# 78. Product north star

The project should ultimately enable a performance like this:

```text
A musician loads an existing song.

The application extracts its musical layers.

The musician raises both hands.

The bass becomes synthetic.

The melody stretches into a granular texture.

The drums collapse into a filtered loop.

The vocals move into a huge reverb.

The musician brings the hands together.

The original song gradually reappears.

The entire performance is recorded.
```

No keyboard or MIDI controller is required.

That is the product.
