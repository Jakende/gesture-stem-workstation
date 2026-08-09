# Third-party notices

Gesture Stem Workstation uses dependencies through their public package APIs; no upstream
source repository has been copied into the application.

| Dependency | Purpose | License |
| --- | --- | --- |
| Tone.js | Web Audio primitives and context integration | MIT |
| wavesurfer.js | Waveform visualization | BSD-3-Clause |
| MediaPipe Tasks Vision | Local hand landmark inference | Apache-2.0 |
| Three.js | Transparent WebGL scene over the local camera view | MIT |
| three.quarks | Batched particle systems and gesture-reactive visual effects | MIT |
| Vite | Web development and build tooling | MIT |
| TypeScript | Static type checking | Apache-2.0 |
| Vitest | Unit testing | MIT |
| Playwright | Browser testing | Apache-2.0 |
| FastAPI | Local processor HTTP API | MIT |
| Pydantic | Processor contracts and validation | MIT |
| Uvicorn | Local ASGI server | BSD-3-Clause |

Optional processing tools are loaded only through adapters and retain their own licenses:

- `python-audio-separator` (MIT) for source separation.
- `basic-pitch` (Apache-2.0) for optional local transcription.
- FFmpeg (build-dependent LGPL/GPL terms) as an external executable.
