# ADR 0004: Three.quarks visualization adapter

Status: accepted

## Context

The camera performance surface needs a transparent, musically reactive particle layer. The
previous two-dimensional canvas effect could not express spatial emitter shapes, trails, or
large particle counts efficiently. The visualization must remain downstream of gesture and
audio state and must never become a second state authority.

## Decision

Use Three.js `0.185.x` and `three.quarks` `0.17.x` behind
`QuarksEffectVisualizer`. The adapter receives only the selected serializable track and the
latest normalized `GestureFrame`. It owns the Three.js scene, Quarks particle systems,
render loop, resize handling, and GPU-resource cleanup.

Track roles select independent presets:

- drums use short circular impulses;
- bass uses heavy orbital sphere emission;
- melody and vocals use long directional trails;
- other and custom tracks use a diffuse grid cloud.

Hand position moves the emitter inside a bounded region in the upper-left third of the
camera surface, camera proximity controls restrained size and depth, and two-hand distance
controls a capped spatial extent. A compact, hard-edged particle texture and normal alpha
blending keep individual points crisp instead of producing a full-screen glow. Filter,
resonance, delay, reverb, freeze feedback,
pinch/stutter, and reverse modify motion and lifetime. Values are sampled from existing
owners; the visualizer does not persist or mutate project, transport, gesture, or audio
state.

If WebGL initialization fails, the canvas is hidden while audio, keyboard, mouse, and
gesture controls remain usable.

## Consequences

The dependency adds a WebGL rendering path and requires explicit disposal of particle
systems, materials, textures, and renderer contexts. Runtime generator objects are retained
and mutated to avoid allocation on the gesture-update path. Both new dependencies use the
MIT license and are recorded in `THIRD_PARTY_NOTICES.md`.
