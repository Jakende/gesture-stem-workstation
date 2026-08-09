from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class TranscriptionResult:
    model: str
    notes: list[dict[str, object]]


class AudioTranscriber(Protocol):
    def transcribe(self, input_path: Path, confidence_threshold: float) -> TranscriptionResult: ...


class UnavailableAudioTranscriber:
    def transcribe(self, input_path: Path, confidence_threshold: float) -> TranscriptionResult:
        del input_path, confidence_threshold
        raise RuntimeError(
            "Audio-to-MIDI is not installed. Run ./scripts/bootstrap --with-transcription."
        )


class SubprocessBasicPitchTranscriber:
    def __init__(self, python_executable: Path, runner_script: Path) -> None:
        self.python_executable = python_executable.resolve()
        self.runner_script = runner_script.resolve()

    def transcribe(self, input_path: Path, confidence_threshold: float) -> TranscriptionResult:
        completed = subprocess.run(
            [
                str(self.python_executable),
                str(self.runner_script),
                str(input_path.resolve()),
                "--confidence-threshold",
                str(confidence_threshold),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=900,
        )
        payload = json.loads(completed.stdout)
        notes = payload.get("notes")
        if not isinstance(notes, list):
            raise RuntimeError("Basic Pitch returned an invalid note payload.")
        return TranscriptionResult(model=str(payload.get("model", "basic-pitch")), notes=notes)


def basic_pitch_runtime_available(repo_root: Path) -> bool:
    return (repo_root / ".venv-basic-pitch" / "bin" / "python").is_file()
