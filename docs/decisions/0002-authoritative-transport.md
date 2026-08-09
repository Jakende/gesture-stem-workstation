# ADR 0002: Application-owned audio transport

Status: accepted

`ProjectTransport` exclusively owns current time, playback, seeking, loop state and the
scheduling origin. WaveSurfer instances visualize buffers and mirror transport time. Track
players are scheduled from the same Web Audio clock and never own independent transport
state.

