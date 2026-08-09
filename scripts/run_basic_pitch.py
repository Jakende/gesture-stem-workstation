from __future__ import annotations

import argparse
import contextlib
import json
import sys
import uuid
from pathlib import Path

from basic_pitch.inference import predict


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe one local audio asset with Basic Pitch.")
    parser.add_argument("audio_path", type=Path)
    parser.add_argument("--confidence-threshold", type=float, default=0.3)
    args = parser.parse_args()

    if not args.audio_path.is_file():
        raise SystemExit("Input audio file does not exist.")

    # Basic Pitch writes inference diagnostics to stdout. Keep stdout machine-readable for
    # the processor contract and forward those diagnostics to captured stderr instead.
    with contextlib.redirect_stdout(sys.stderr):
        _model_output, _midi_data, raw_notes = predict(str(args.audio_path.resolve()))
    notes: list[dict[str, object]] = []
    for raw_note in raw_notes:
        start, end, pitch, amplitude, *optional = raw_note
        confidence = float(amplitude)
        if confidence < args.confidence_threshold:
            continue
        note: dict[str, object] = {
            "id": f"note_{uuid.uuid4().hex}",
            "pitch": int(pitch),
            "velocity": max(1, min(127, round(confidence * 127))),
            "startSeconds": float(start),
            "durationSeconds": max(0.01, float(end) - float(start)),
            "confidence": confidence,
        }
        if optional and optional[0] is not None:
            bends = optional[0]
            note["pitchBends"] = [
                {"timeOffsetSeconds": index * 0.01, "semitones": float(value) / 8192 * 2}
                for index, value in enumerate(bends)
            ]
        notes.append(note)

    print(json.dumps({"model": "spotify/basic-pitch", "notes": notes}, separators=(",", ":")))


if __name__ == "__main__":
    main()
