from __future__ import annotations

from datetime import UTC, datetime
from threading import Lock
from uuid import uuid4

from .contracts import JobStatus, JobType, ProcessingJob, ProcessorError


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, ProcessingJob] = {}
        self._lock = Lock()

    def create(self, job_type: JobType) -> ProcessingJob:
        job = ProcessingJob(id=f"job_{uuid4().hex}", type=job_type)
        with self._lock:
            self._jobs[job.id] = job
        return job.model_copy(deep=True)

    def get(self, job_id: str) -> ProcessingJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return job.model_copy(deep=True) if job else None

    def cancel(self, job_id: str) -> ProcessingJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job.status in {JobStatus.QUEUED, JobStatus.RUNNING}:
                job.status = JobStatus.CANCELLED
                job.completed_at = datetime.now(UTC)
            return job.model_copy(deep=True)

    def start(self, job_id: str) -> ProcessingJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status != JobStatus.QUEUED:
                return None
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(UTC)
            job.progress = 0.05
            return job.model_copy(deep=True)

    def complete(self, job_id: str, result: dict[str, object]) -> ProcessingJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status != JobStatus.RUNNING:
                return None
            job.status = JobStatus.COMPLETED
            job.progress = 1
            job.result = result
            job.completed_at = datetime.now(UTC)
            return job.model_copy(deep=True)

    def fail(self, job_id: str, code: str, message: str, diagnostic: str) -> ProcessingJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status not in {JobStatus.QUEUED, JobStatus.RUNNING}:
                return None
            job.status = JobStatus.FAILED
            job.error = ProcessorError(code=code, message=message, diagnostic=diagnostic)
            job.completed_at = datetime.now(UTC)
            return job.model_copy(deep=True)
