import type { ProcessingJob, TranscriptionJobResult } from "@gsw/protocol";

interface UploadedAsset {
  id: string;
}

export class ProcessorClient {
  constructor(readonly baseUrl: string) {}

  async uploadAsset(projectId: string, blob: Blob, filename: string): Promise<UploadedAsset> {
    const form = new FormData();
    form.append("file", blob, filename);
    const response = await fetch(`${this.baseUrl}/projects/${encodeURIComponent(projectId)}/assets`, {
      method: "POST",
      body: form
    });
    if (!response.ok) throw new Error(await this.#message(response, "Asset upload failed."));
    return response.json() as Promise<UploadedAsset>;
  }

  async transcribe(projectId: string, assetId: string, confidenceThreshold = 0.3): Promise<TranscriptionJobResult> {
    const response = await fetch(`${this.baseUrl}/jobs/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, assetId, confidenceThreshold })
    });
    if (!response.ok) throw new Error(await this.#message(response, "Could not create transcription job."));
    let job = await response.json() as ProcessingJob;
    while (job.status === "queued" || job.status === "running") {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      const poll = await fetch(`${this.baseUrl}/jobs/${encodeURIComponent(job.id)}`);
      if (!poll.ok) throw new Error(await this.#message(poll, "Could not read transcription job."));
      job = await poll.json() as ProcessingJob;
    }
    if (job.status !== "completed" || !job.result) {
      throw new Error(job.error?.message ?? `Transcription ended with status ${job.status}.`);
    }
    return job.result as unknown as TranscriptionJobResult;
  }

  async #message(response: Response, fallback: string): Promise<string> {
    try {
      const body = await response.json() as { detail?: string };
      return body.detail ?? fallback;
    } catch {
      return fallback;
    }
  }
}
