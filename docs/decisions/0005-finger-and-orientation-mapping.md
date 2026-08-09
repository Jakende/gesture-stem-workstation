# ADR 0005: Finger and orientation mapping

Status: accepted

## Context

Whole-hand position, openness, and pinch provide too few independent dimensions for the
workstation's growing effect rack. Directly coupling MediaPipe landmark indices to audio
nodes would make the behavior difficult to test, smooth, persist, and reassign.

## Decision

The gesture domain converts each 21-point hand landmark set into normalized features before
the mapping engine sees it. The feature set includes:

- flexion and fingertip X/Y/Z for thumb, index, middle, ring, and pinky;
- roll, pitch, yaw, palm-facing, openness, pinch, position, depth, and velocity per hand;
- distance, angle, and depth difference between both hands.

Finger flexion is calculated from the two internal joint angles of each finger. Palm-facing
and rotation values are geometric estimates in the camera coordinate system. They are
normalized performance controls, not anatomical measurements.

Continuous mappings retain curve, inversion, dead-zone, and smoothing configuration.
Boolean targets use separate on/off thresholds in the mapping engine. This hysteresis keeps
Stutter and Reverse stable around the switching boundary. Mouse controls remain available
for every affected parameter.

The project schema advances to version 5. Existing version 1–4 projects are migrated with
defaults for filter-modulation depth/rate and Reverse speed. Original audio remains immutable.

## Consequences

The synthetic gesture source must emit the expanded feature set so the full mapping path can
be tested without a webcam. Gesture Learn can select any continuous finger or orientation
feature. Reverse speed intentionally affects only the reversed source; normal playback stays
at transport speed and resynchronizes when Reverse is switched.
