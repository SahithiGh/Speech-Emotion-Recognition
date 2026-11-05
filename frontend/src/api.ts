import { API_BASE } from "./site";

export const EMOTIONS = ["angry", "disgust", "fear", "happy", "neutral", "sad"] as const;

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export interface ConsistencyResult {
  status: "consistent" | "divergent" | "inconclusive";
  display_label: string;
  explanation: string;
  text_affect: {
    polarity: string;
    pos_score?: number;
    neg_score?: number;
    detected_emotions: string[];
    cues: string[];
    word_count?: number;
  };
}

export interface AudioQuality {
  status: "GOOD" | "WARNING" | "NOISY" | "UNUSABLE";
  initial_status?: string;
  noise_reduced?: boolean;
  prediction_accepted: boolean;
  code: string;
  reason: string;
  snr_db: number;
  noise_floor: number;
  speech_duration: number;
  speech_ratio: number;
  clipping_fraction: number;
  flatness: number;
  warnings: string[];
}

export interface NoiseReductionInfo {
  applied: boolean;
  method?: string;
  reason?: string;
  status_before?: string;
  status_after?: string;
  noise_floor_before?: number;
  noise_floor_after?: number;
  noise_floor_reduction_pct?: number;
  snr_before?: number;
  snr_after?: number;
  snr_improvement_db?: number;
  message?: string;
}

export interface Reliability { available: boolean; validated_accuracy: number | null; samples: number; score_range: [number, number] | null; uncertain: boolean | null }
export interface OodDetails {
  is_ood: boolean;
  max_deviation: number;
  threshold: number;
  warning: string | null;
}
export interface AudioPlaybackInfo {
  original_audio_url?: string | null;
  processed_audio_url?: string | null;
  has_processed?: boolean;
  stream_url?: string | null;
}
export interface SpeakerVoiceMetrics {
  mean_pitch_hz?: number;
  pitch_std_hz?: number;
  pitch_range_hz?: [number, number];
  mean_energy_db?: number;
  dynamic_range_db?: number;
}

export interface SpeakerInfo {
  speaker_id: string;
  name: string;
  label?: string;
  speaking_seconds: number;
  speaking_percentage: number;
  segment_count: number;
  dominant_emotion: string;
  confidence: number;
  emotion_distribution: Record<string, number>;
  voice_metrics?: SpeakerVoiceMetrics;
}

export interface ConversationTurn {
  turn_index?: number;
  speaker_id: string;
  speaker_name: string;
  start: number;
  end: number;
  duration?: number;
  emotion?: string;
  top_score?: number;
  scores?: Record<string, number>;
  overlap?: boolean;
}

export interface EmotionTrackPoint {
  time: number;
  probability: number;
}

export interface EmotionJourneyBlock {
  start: number;
  end: number;
  emotion: string;
  confidence: number;
  scores?: Record<string, number>;
}

export interface PitchAnalysis {
  mean_hz: number;
  median_hz: number;
  min_hz: number;
  max_hz: number;
  std_hz: number;
  voiced_ratio: number;
  voiced_percentage?: number;
  time_series?: { time: number; pitch_hz: number }[];
}

export interface VocalEnergyAnalysis {
  mean_db: number;
  max_db: number;
  dynamic_range_db: number;
  time_series?: { time: number; energy_db: number }[];
}

export interface VoiceAnalysisData {
  duration?: number;
  pitch?: PitchAnalysis;
  energy?: VocalEnergyAnalysis;
  speaker_metrics?: Record<string, SpeakerVoiceMetrics>;
  disclaimer?: string;
}

export interface CombinedTranscriptItem {
  index: number;
  speaker_id: string;
  speaker_name: string;
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
  emotion?: string;
  scores?: Record<string, number>;
  confidence?: number;
}

export interface PredictResult {
  prediction_accepted?: boolean;
  audio_quality?: AudioQuality;
  initial_audio_quality?: AudioQuality;
  noise_reduction?: NoiseReductionInfo;
  audio_playback?: AudioPlaybackInfo;
  emotion: string | null;
  confidence: number;
  margin: number;
  scores: Record<string, number>;
  score_type: string;
  uncertain?: boolean;
  out_of_distribution?: boolean;
  ood_details?: OodDetails;
  reliability: Reliability;
  analyzed_seconds: number;
  recording_duration?: number;
  processing_ms: number;
  notes: string[];
  model: { id: string | null; name: string | null; trained_at: string | null; language: string; dataset: string; profile?: string };
  speakers?: SpeakerInfo[];
  conversation_timeline?: ConversationTurn[];
  emotion_tracks?: Record<string, EmotionTrackPoint[]>;
  emotion_journey?: EmotionJourneyBlock[];
  voice_analysis?: VoiceAnalysisData;
  speaker_count?: number;
  transcription?: {
    available?: boolean;
    status?: string;
    reason?: string | null;
    text: string | null;
    segments?: TranscriptSegment[];
    combined_transcript?: CombinedTranscriptItem[];
    engine?: string;
    language?: string;
    language_code?: string;
    language_name?: string;
    language_probability?: number;
    is_english?: boolean;
    case?: "A" | "B" | "C";
    message?: string | null;
    no_speech?: boolean;
    has_word_timestamps?: boolean;
    note?: string;
  } | null;
  consistency?: ConsistencyResult | null;
}
export type ModelStateName = "ready" | "missing" | "incompatible";
export interface ModelStatus { trained: boolean; state: ModelStateName; reason: string | null; model_name: string | null; generated_at: string | null; dataset_verification: string | null; profile?: string; ood_safeguard?: boolean; ood_threshold?: number }
export interface TimelineLimits { default_window: number; default_step: number; min_window: number; max_window: number; min_step: number; max_segments: number }
export interface AppConfig { max_upload_mb: number; max_audio_seconds: number; min_audio_seconds: number; max_record_seconds: number; analysed_seconds: number; formats: string[]; sample_rate: number; timeline?: TimelineLimits }
export const DEFAULT_TIMELINE: TimelineLimits = { default_window: 2, default_step: 1, min_window: 1, max_window: 4, min_step: 0.5, max_segments: 240 };
export const DEFAULT_CONFIG: AppConfig = { max_upload_mb: 15, max_audio_seconds: 60, min_audio_seconds: 0.5, max_record_seconds: 15, analysed_seconds: 6, formats: ["WAV", "MP3", "OGG", "FLAC", "M4A (converted by the browser)"], sample_rate: 16000, timeline: DEFAULT_TIMELINE };
export interface ModelInfo {
  status: ModelStateName; reason: string | null; evaluation_status: "evaluated" | "pending"; emotions: string[]; limitations: string[];
  languages: { code: string; name: string; dataset: string; status: string }[];
  dataset: { name: string; source: string; license: string; nature: string; citation: string };
  model_id?: string; model_name?: string; trained_at?: string; architecture?: string; sample_rate?: number; expected_input?: string; uncertainty?: string;
  preprocessing?: { features: string; n_features: number; feature_version: number; max_seconds: number; min_seconds: number; trim_top_db: number };
}
export interface ClassMetrics { precision: number; recall: number; f1: number; support: number }
export interface Candidate { model: string; cv_macro_f1_mean: number; cv_macro_f1_std: number; cv_accuracy_mean: number }
export interface Metrics {
  trained: boolean;
  message?: string;
  accuracy: number;
  balanced_accuracy: number;
  macro_precision?: number;
  macro_recall?: number;
  macro_f1: number;
  per_class?: Record<string, ClassMetrics>;
  confusion_matrix?: number[][];
  labels?: string[];
  unweighted_average_recall?: number;
  classification_report?: string;
  feature_importance?: { method: string; caveat: string; groups: { key: string; label: string; description: string; n_features: number; importance_mean: number; importance_std: number }[] };
  comparison?: { model: string; selected: boolean; macro_f1: number; uar: number; accuracy: number; macro_precision: number; per_class_recall: Record<string, number>; confusion_matrix: number[][]; training_seconds: number; settings: Record<string, string> }[] | null;
  comparison_note?: string;
  reliability?: { bins: { low: number; high: number; samples: number; accuracy: number | null }[]; source: string; rule: string };
  preprocessing?: { features: string; n_features: number; feature_version?: string };
  n_samples?: number;
  model_name: string;
  model_size_mb?: number;
  selection?: string;
  generated_at: string;
  dataset?: string;
  evaluated_on?: string;
  total_clips_used?: number;
  total_speakers?: number;
  skipped_clips?: number;
  split?: { test?: { speakers: number; clips: number }; development?: { speakers: number; clips: number }; folds?: { validation_speakers: number; validation_clips: number }[] };
  class_distribution?: { all?: Record<string, number>; development?: Record<string, number>; test?: Record<string, number> };
  candidates?: Candidate[];
  confidence_intervals?: { accuracy_95ci: [number, number]; macro_f1_95ci: [number, number]; method: string } | null;
  per_speaker_accuracy?: { min: number; median: number; max: number; speakers: number };
  baselines?: { majority_class_accuracy: number; majority_class_macro_f1: number; uniform_chance_accuracy: number };
  dataset_verification?: { mode: string; files_matching_official_list?: number; complete?: boolean; problems?: number };
  reproducibility?: { seed?: number; dataset_fingerprint?: string; n_features?: number; python?: string; sklearn?: string; librosa?: string };
  test_samples?: number;
  test_speakers?: number;
  benchmark_limitation?: { title: string; disclosure: string };
}

export interface Segment { index: number; start: number; end: number; status: "ok" | "silent" | "too_short" | "failed"; emotion: string | null; top_score: number | null; scores: Record<string, number> | null }
export interface TimelineResult { duration: number; window_seconds: number; step_seconds: number; overlap_seconds: number; segments: Segment[]; counts: Record<string, number>; caution: string; model: PredictResult["model"] }
export interface SpectrogramResult { duration: number; sample_rate: number; n_mels: number; frames: number; frame_seconds: number; first_frame_center_seconds: number; mel_frequencies_hz: number[]; db_min: number; db_max: number; scale: string; data: string }
export interface TranscriptionStatus { engine: string | null; label: string | null; available: boolean; runs_locally: boolean; language: string; evaluated: boolean; privacy: string; reason: string | null }
export interface Transcript { text: string; segments: { start: number; end: number; text: string }[]; engine: string; language: string; no_speech: boolean; note: string }

export const OFFLINE = "Cannot reach the backend. Start it with run_project.bat and keep the backend window open.";

async function request<T>(url: string, init?: RequestInit, timeoutMs = 90000): Promise<T> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_BASE + url, { ...init, signal: ctl.signal });
  } catch {
    throw new ApiError(OFFLINE, "offline");
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) {
    let message = `The server returned an error (${res.status}).`;
    let code = "http";
    try {
      const body = await res.json();
      if (body?.detail?.message) { message = body.detail.message; code = body.detail.code ?? code; }
    } catch {
      if (res.status >= 500) { message = OFFLINE; code = "offline"; } // the dev proxy answers 500 when the backend is down
    }
    throw new ApiError(message, code);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}

export const getStatus = () => request<ModelStatus>("/api/model/status", undefined, 15000);
export const getConfig = () => request<AppConfig>("/api/config", undefined, 15000);
export const getInfo = () => request<ModelInfo>("/api/model/info", undefined, 15000);
export const getMetrics = () => request<Metrics>("/api/metrics", undefined, 15000);
export function predict(audio: Blob, filename: string): Promise<PredictResult> {
  const form = new FormData();
  form.append("file", audio, filename);
  return request<PredictResult>("/api/predict", { method: "POST", body: form });
}

export const getSpectrogram = (audio: Blob, filename: string) => {
  const form = new FormData(); form.append("file", audio, filename);
  return request<SpectrogramResult>("/api/spectrogram", { method: "POST", body: form });
};
export const getTimeline = (audio: Blob, filename: string, windowS: number, hopS: number) => {
  const form = new FormData(); form.append("file", audio, filename); form.append("window_s", String(windowS)); form.append("hop_s", String(hopS));
  return request<TimelineResult>("/api/timeline", { method: "POST", body: form });
};
export const getTranscriptionStatus = () => request<TranscriptionStatus>("/api/transcription/status", undefined, 15000);
export const getTranscript = (audio: Blob, filename: string) => {
  const form = new FormData(); form.append("file", audio, filename);
  return request<Transcript>("/api/transcribe", { method: "POST", body: form }, 180000);
};

export interface SampleItem { id: string; title: string; file: string; description: string; source: string; license: string }
export async function getSamples(): Promise<SampleItem[]> {
  const res = await fetch("/samples/manifest.json");
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j.samples) ? j.samples : [];
}

export async function recalculateConsistency(data: {
  transcript: string;
  predicted_emotion: string;
  confidence?: number;
  is_uncertain?: boolean;
}): Promise<ConsistencyResult> {
  return request<ConsistencyResult>("/api/consistency/recalculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export interface JobProgressResponse {
  job_id: string;
  stage: string;
  stage_label: string;
  progress_pct: number;
  done: boolean;
  result?: PredictResult;
  error?: string | null;
}

export function analyzeConversationJob(file: Blob, filename: string): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file, filename);
  return request<{ job_id: string }>("/api/analyze/conversation", { method: "POST", body: form }, 180000);
}

export function getJobProgress(jobId: string): Promise<JobProgressResponse> {
  return request<JobProgressResponse>(`/api/jobs/${jobId}/progress`, undefined, 15000);
}

export function renameSpeaker(analysisId: string, speakerId: string, name: string): Promise<any> {
  const token = localStorage.getItem("ser_session_token");
  return request(`/api/analyses/${analysisId}/speakers/rename`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ speaker_id: speakerId, name }),
  });
}

export async function downloadBlob(url: string, init?: RequestInit, defaultFilename = "download"): Promise<void> {
  const res = await fetch(API_BASE + url, init);
  if (!res.ok) {
    throw new Error(`Export download failed (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  let filename = defaultFilename;
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename=["']?([^"']+)["']?/);
    if (match && match[1]) filename = match[1];
  }
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export const exportPdfDirect = (analysis: any) =>
  downloadBlob("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis }),
  }, "SER_Report.pdf");

export const exportCsvDirect = (analysis: any) =>
  downloadBlob("/api/export/csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis }),
  }, "SER_Export.zip");

export const exportPdfSaved = (analysisId: string, token: string) =>
  downloadBlob(`/api/analyses/${analysisId}/export/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  }, "SER_Report.pdf");

export const exportCsvSaved = (analysisId: string, token: string) =>
  downloadBlob(`/api/analyses/${analysisId}/export/csv`, {
    headers: { Authorization: `Bearer ${token}` },
  }, "SER_Export.zip");
