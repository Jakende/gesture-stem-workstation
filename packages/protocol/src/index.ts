export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobType = "stem-separation" | "transcription" | "waveform-analysis";

export interface ProcessorHealth {
  status: "ok";
  version: string;
  ffmpegAvailable: boolean;
  separatorAvailable: boolean;
  transcriptionAvailable: boolean;
}

export interface TranscriptionJobResult {
  model: string;
  sourceAssetId: string;
  confidenceThreshold: number;
  notes: Array<{
    id: string;
    pitch: number;
    velocity: number;
    startSeconds: number;
    durationSeconds: number;
    confidence?: number;
    pitchBends?: Array<{ timeOffsetSeconds: number; semitones: number }>;
  }>;
}

export interface ProcessingJob {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: { code: string; message: string; diagnostic?: string };
  result?: Record<string, unknown>;
}
