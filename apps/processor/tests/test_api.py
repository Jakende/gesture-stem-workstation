from pathlib import Path

from fastapi.testclient import TestClient

from gesture_stem_processor.api import create_app
from gesture_stem_processor.separation import SeparationResult
from gesture_stem_processor.transcription import TranscriptionResult


class FakeStemSeparator:
    def separate(self, input_path: Path, output_dir: Path, profile: str) -> SeparationResult:
        assert input_path.exists()
        assert profile == "four-stem"
        return SeparationResult(
            model="fake-four-stem",
            stems={
                role: output_dir / f"{role}.wav"
                for role in ("vocals", "drums", "bass", "other")
            },
        )


class FakeAudioTranscriber:
    def transcribe(self, input_path: Path, confidence_threshold: float) -> TranscriptionResult:
        assert input_path.exists()
        assert confidence_threshold == 0.4
        return TranscriptionResult(
            model="fake-basic-pitch",
            notes=[
                {
                    "id": "note_1",
                    "pitch": 60,
                    "velocity": 100,
                    "startSeconds": 0.2,
                    "durationSeconds": 0.5,
                    "confidence": 0.8,
                }
            ],
        )


def test_health_reports_local_dependencies(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert isinstance(response.json()["ffmpegAvailable"], bool)


def test_asset_upload_is_hashed_and_deduplicated(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    payload = b"RIFF" + b"audio" * 20
    response = client.post(
        "/projects/demo/assets", files={"file": ("bass.wav", payload, "audio/wav")}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"].startswith("asset_")
    assert len(body["sha256"]) == 64


def test_rejects_unsupported_and_traversal_names(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    response = client.post(
        "/projects/demo/assets", files={"file": ("../../run.sh", b"echo nope", "text/plain")}
    )
    assert response.status_code == 400


def test_job_runs_adapter_and_uses_canonical_states(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path, FakeStemSeparator()))
    upload = client.post(
        "/projects/demo/assets", files={"file": ("mix.wav", b"RIFF-audio", "audio/wav")}
    )
    created = client.post(
        "/jobs/separate",
        json={"projectId": "demo", "assetId": upload.json()["id"], "profile": "four-stem"},
    )
    assert created.status_code == 200
    assert created.json()["status"] == "queued"
    completed = client.get(f"/jobs/{created.json()['id']}")
    assert completed.json()["status"] == "completed"
    assert completed.json()["result"]["model"] == "fake-four-stem"


def test_missing_separator_produces_actionable_failure(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    upload = client.post(
        "/projects/demo/assets", files={"file": ("mix.wav", b"RIFF-audio", "audio/wav")}
    )
    created = client.post(
        "/jobs/separate",
        json={"projectId": "demo", "assetId": upload.json()["id"], "profile": "four-stem"},
    )
    failed = client.get(f"/jobs/{created.json()['id']}").json()
    assert failed["status"] == "failed"
    assert "FFmpeg" in failed["error"]["message"]


def test_transcription_job_returns_canonical_note_events(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path, FakeStemSeparator(), FakeAudioTranscriber()))
    upload = client.post(
        "/projects/demo/assets", files={"file": ("melody.wav", b"RIFF-audio", "audio/wav")}
    )
    created = client.post(
        "/jobs/transcribe",
        json={
            "projectId": "demo",
            "assetId": upload.json()["id"],
            "confidenceThreshold": 0.4,
        },
    )
    assert created.status_code == 200
    completed = client.get(f"/jobs/{created.json()['id']}").json()
    assert completed["status"] == "completed"
    assert completed["result"]["model"] == "fake-basic-pitch"
    assert completed["result"]["notes"][0]["pitch"] == 60
