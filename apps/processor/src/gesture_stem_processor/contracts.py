from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(StrEnum):
    STEM_SEPARATION = "stem-separation"
    TRANSCRIPTION = "transcription"
    WAVEFORM_ANALYSIS = "waveform-analysis"


class ProcessorError(ContractModel):
    code: str
    message: str
    diagnostic: str | None = None


class ProcessingJob(ContractModel):
    id: str
    type: JobType
    status: JobStatus = JobStatus.QUEUED
    progress: float = Field(default=0, ge=0, le=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: ProcessorError | None = None
    result: dict[str, Any] | None = None


class SeparationRequest(ContractModel):
    project_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    asset_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    profile: str = "four-stem"


class TranscriptionRequest(ContractModel):
    project_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    asset_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    confidence_threshold: float = Field(default=0.3, ge=0, le=1)


class HealthResponse(ContractModel):
    status: str = "ok"
    version: str
    ffmpeg_available: bool
    separator_available: bool
    transcription_available: bool
