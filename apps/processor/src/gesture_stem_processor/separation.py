from __future__ import annotations

import importlib.util
from collections.abc import Callable
from dataclasses import dataclass
from importlib import import_module
from pathlib import Path
from typing import Protocol, cast


@dataclass(frozen=True)
class SeparationResult:
    model: str
    stems: dict[str, Path]


class StemSeparator(Protocol):
    def separate(self, input_path: Path, output_dir: Path, profile: str) -> SeparationResult: ...


class SeparatorRuntime(Protocol):
    def load_model(self, model_filename: str) -> None: ...

    def separate(self, audio_file_path: str) -> list[str]: ...


def audio_separator_available() -> bool:
    return importlib.util.find_spec("audio_separator") is not None


class UnavailableStemSeparator:
    def separate(self, input_path: Path, output_dir: Path, profile: str) -> SeparationResult:
        del input_path, output_dir, profile
        raise RuntimeError(
            "Stem separation is not installed. Run ./scripts/bootstrap --with-separation "
            "or import the provided pre-separated stems."
        )


class AudioSeparatorStemSeparator:
    MODELS = {"four-stem": "htdemucs.yaml"}

    def __init__(self, model_dir: Path) -> None:
        self.model_dir = model_dir.resolve()

    def separate(self, input_path: Path, output_dir: Path, profile: str) -> SeparationResult:
        model = self.MODELS.get(profile)
        if model is None:
            raise ValueError(f"Unsupported separation profile: {profile}")
        output_dir.mkdir(parents=True, exist_ok=True)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        module = import_module("audio_separator.separator")
        separator_type = cast(Callable[..., SeparatorRuntime], module.Separator)
        separator = separator_type(
            output_dir=str(output_dir),
            output_format="WAV",
            model_file_dir=str(self.model_dir),
        )
        separator.load_model(model_filename=model)
        generated = separator.separate(str(input_path))
        stems: dict[str, Path] = {}
        for generated_name in generated:
            generated_path = Path(generated_name)
            if not generated_path.is_absolute():
                generated_path = output_dir / generated_path
            canonical = generated_path.resolve()
            if output_dir.resolve() not in canonical.parents:
                raise RuntimeError("Separator returned an output outside the project directory.")
            lowered = canonical.stem.lower()
            for role in ("vocals", "drums", "bass", "other", "instrumental"):
                if role in lowered:
                    stems[role] = canonical
                    break
        if len(stems) < 4:
            raise RuntimeError(
                "The selected four-stem model did not return vocals, drums, bass and other."
            )
        return SeparationResult(model=model, stems=stems)
