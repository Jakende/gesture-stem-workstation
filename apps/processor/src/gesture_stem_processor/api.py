from __future__ import annotations

import json
import shutil
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .contracts import (
    HealthResponse,
    JobType,
    ProcessingJob,
    SeparationRequest,
    TranscriptionRequest,
)
from .jobs import JobStore
from .separation import (
    AudioSeparatorStemSeparator,
    StemSeparator,
    UnavailableStemSeparator,
    audio_separator_available,
)
from .storage import AssetStore
from .transcription import (
    AudioTranscriber,
    SubprocessBasicPitchTranscriber,
    UnavailableAudioTranscriber,
    basic_pitch_runtime_available,
)


def create_app(
    data_root: Path | None = None,
    stem_separator: StemSeparator | None = None,
    audio_transcriber: AudioTranscriber | None = None,
) -> FastAPI:
    root = (data_root or Path("data")).resolve()
    asset_store = AssetStore(root)
    jobs = JobStore()
    separator = stem_separator or (
        AudioSeparatorStemSeparator(root / "models")
        if audio_separator_available()
        else UnavailableStemSeparator()
    )
    repo_root = Path(__file__).resolve().parents[4]
    transcriber = audio_transcriber or (
        SubprocessBasicPitchTranscriber(
            repo_root / ".venv-basic-pitch" / "bin" / "python",
            repo_root / "scripts" / "run_basic_pitch.py",
        )
        if basic_pitch_runtime_available(repo_root)
        else UnavailableAudioTranscriber()
    )
    app = FastAPI(title="Gesture Stem Processor", version=__version__, response_model_by_alias=True)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            version=__version__,
            ffmpeg_available=shutil.which("ffmpeg") is not None,
            separator_available=audio_separator_available(),
            transcription_available=basic_pitch_runtime_available(repo_root),
        )

    @app.post("/projects/{project_id}/assets")
    async def upload_asset(project_id: str, file: UploadFile) -> dict[str, str | int]:
        if not project_id.replace("-", "").replace("_", "").isalnum():
            raise HTTPException(status_code=400, detail="Invalid project identifier.")
        try:
            asset = await asset_store.save(project_id, file)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return {
            "id": asset.asset_id,
            "filename": asset.filename,
            "sha256": asset.sha256,
            "size": asset.size,
        }

    def run_separation(job_id: str, request: SeparationRequest) -> None:
        if jobs.start(job_id) is None:
            return
        try:
            input_path = asset_store.resolve(request.project_id, request.asset_id)
            output_dir = (
                root / "projects" / request.project_id / "assets" / "stems" / request.asset_id
            )
            result = separator.separate(input_path, output_dir, request.profile)
            jobs.complete(
                job_id,
                {
                    "model": result.model,
                    "sourceAssetId": request.asset_id,
                    "stems": {role: str(path) for role, path in result.stems.items()},
                },
            )
        except FileNotFoundError:
            jobs.fail(
                job_id,
                "asset-not-found",
                "Stem separation could not start because the source asset was not found.",
                request.asset_id,
            )
        except Exception as error:
            jobs.fail(
                job_id,
                "separation-failed",
                "Stem separation failed. Check the local model and FFmpeg installation.",
                str(error),
            )

    @app.post("/jobs/separate", response_model=ProcessingJob)
    def create_separation_job(
        request: SeparationRequest, background_tasks: BackgroundTasks
    ) -> ProcessingJob:
        job = jobs.create(JobType.STEM_SEPARATION)
        background_tasks.add_task(run_separation, job.id, request)
        return job

    def run_transcription(job_id: str, request: TranscriptionRequest) -> None:
        if jobs.start(job_id) is None:
            return
        try:
            input_path = asset_store.resolve(request.project_id, request.asset_id)
            analysis_dir = root / "projects" / request.project_id / "assets" / "analysis"
            analysis_dir.mkdir(parents=True, exist_ok=True)
            threshold_key = round(request.confidence_threshold * 1000)
            cache_path = analysis_dir / f"{request.asset_id}-basic-pitch-{threshold_key}.json"
            if cache_path.is_file():
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                model = str(cached["model"])
                notes = list(cached["notes"])
            else:
                result = transcriber.transcribe(input_path, request.confidence_threshold)
                model = result.model
                notes = result.notes
                temporary = cache_path.with_suffix(".tmp")
                temporary.write_text(
                    json.dumps({"model": model, "notes": notes}, separators=(",", ":")),
                    encoding="utf-8",
                )
                temporary.replace(cache_path)
            jobs.complete(
                job_id,
                {
                    "model": model,
                    "sourceAssetId": request.asset_id,
                    "confidenceThreshold": request.confidence_threshold,
                    "notes": notes,
                },
            )
        except FileNotFoundError:
            jobs.fail(
                job_id,
                "asset-not-found",
                "Transcription could not start because the source asset was not found.",
                request.asset_id,
            )
        except Exception as error:
            jobs.fail(
                job_id,
                "transcription-failed",
                "Audio-to-MIDI transcription failed. Check the Basic Pitch installation.",
                str(error),
            )

    @app.post("/jobs/transcribe", response_model=ProcessingJob)
    def create_transcription_job(
        request: TranscriptionRequest, background_tasks: BackgroundTasks
    ) -> ProcessingJob:
        job = jobs.create(JobType.TRANSCRIPTION)
        background_tasks.add_task(run_transcription, job.id, request)
        return job

    @app.get("/jobs/{job_id}", response_model=ProcessingJob)
    def get_job(job_id: str) -> ProcessingJob:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Processing job not found.")
        return job

    @app.delete("/jobs/{job_id}", response_model=ProcessingJob)
    def cancel_job(job_id: str) -> ProcessingJob:
        job = jobs.cancel(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Processing job not found.")
        return job

    return app


app = create_app()
