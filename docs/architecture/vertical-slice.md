# First playable vertical slice

## Ownership

```text
ProjectStore ── serializable track and mapping state
     │
     ├── ProjectTransport ── current time, play state, seek, loop
     │        ├── TrackAudioEngine ── scheduled Web Audio sources and FX
     │        └── WaveformView[] ── visualization followers
     │
     └── GestureMappingEngine ── mapped parameter values
              ↑
       MediaPipeGestureSource / SyntheticGestureSource
```

`ProjectTransport` is the only module that advances playback time. WaveSurfer never plays
audio in the performance path; it decodes and renders waveforms, then follows transport
time. Track audio sources are created from the same decoded buffers and scheduled against a
single AudioContext clock.

## Example-material behavior

The repository stems use 48 kHz, 24-bit stereo WAV but have unequal durations. Import uses
the longest decoded buffer as project duration. A shorter source simply ends; it does not
stop or rebase the common transport.

The Vite development adapter exposes only a fixed allow-list of the four example filenames.
It resolves canonical paths before serving files and never changes the contents of
`uploads/`.

## Gesture path

```text
camera landmarks
→ normalized hand features
→ EMA smoothing + range/curve/dead-zone mapping
→ versioned mapping records
→ selected track state
→ smoothed AudioParam automation
```

The synthetic source implements the same `GestureSource` interface. No gesture test depends
on a camera, and every critical action remains available through ordinary controls.

