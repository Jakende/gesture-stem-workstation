from pathlib import Path
from subprocess import CompletedProcess

from pytest import MonkeyPatch

from gesture_stem_processor.transcription import SubprocessBasicPitchTranscriber


def test_virtualenv_interpreter_symlink_is_not_resolved(
    tmp_path: Path, monkeypatch: MonkeyPatch
) -> None:
    environment = tmp_path / "basic-pitch-venv"
    bin_dir = environment / "bin"
    bin_dir.mkdir(parents=True)
    base_python = tmp_path / "base-python"
    base_python.touch()
    virtual_python = bin_dir / "python"
    virtual_python.symlink_to(base_python)
    runner = tmp_path / "runner.py"
    runner.touch()
    captured: dict[str, list[str]] = {}

    def fake_run(arguments: list[str], **_kwargs: object) -> CompletedProcess[str]:
        captured["arguments"] = arguments
        return CompletedProcess(arguments, 0, '{"model":"basic-pitch","notes":[]}', "")

    monkeypatch.setattr("gesture_stem_processor.transcription.subprocess.run", fake_run)
    transcriber = SubprocessBasicPitchTranscriber(virtual_python, runner)
    result = transcriber.transcribe(tmp_path / "audio.wav", 0.3)

    assert captured["arguments"][0] == str(virtual_python.absolute())
    assert captured["arguments"][0] != str(virtual_python.resolve())
    assert result.notes == []
