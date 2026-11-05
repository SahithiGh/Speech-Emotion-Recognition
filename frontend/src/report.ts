import type { PredictResult, TimelineResult, Transcript } from "./api";
import type { Source } from "./types";

export const LIMITATIONS = [
  "This is an estimate of which acted emotion the voice sounds like. It does not show what the speaker truly feels.",
  "The model was trained on acted English speech (CREMA-D); results on other speech, microphones or languages are expected to be less reliable.",
  "Scores are normalized across six classes and are not calibrated probabilities.",
  "Segment results were not evaluated on short windows and can be unreliable for short or noisy speech.",
  "Do not use this report to judge, grade or make decisions about a person.",
];

/** The report contains only what is on screen: no file name, no file path and no audio. */
export function buildReport(result: PredictResult, source: Source, timeline: TimelineResult | null, transcript: Transcript | null) {
  return {
    report_version: 1,
    generated_at: new Date().toISOString(),
    software: "Speech Emotion Recognition",
    audio: { source: source.kind, duration_seconds: Number(source.buffer.duration.toFixed(2)), size_bytes: source.blob.size, media_type: source.blob.type || "unknown", analysed_speech_seconds: result.analyzed_seconds },
    model: { name: result.model.name, id: result.model.id, trained_at: result.model.trained_at, dataset: result.model.dataset, language: result.model.language },
    prediction: {
      closest_emotion: result.emotion, highest_score: result.confidence, lead_over_next: result.margin,
      score_type: result.score_type, scores: result.scores,
      validation_reliability: result.reliability.available ? { validated_accuracy: result.reliability.validated_accuracy, validation_clips: result.reliability.samples, score_range: result.reliability.score_range, marked_uncertain: result.reliability.uncertain } : null,
    },
    notes: result.notes,
    timeline: timeline && { window_seconds: timeline.window_seconds, step_seconds: timeline.step_seconds, caution: timeline.caution, counts: timeline.counts, segments: timeline.segments },
    transcript: transcript && { text: transcript.text, engine: transcript.engine, language: transcript.language, no_speech: transcript.no_speech, note: transcript.note },
    limitations: LIMITATIONS,
  };
}
export type Report = ReturnType<typeof buildReport>;

const cell = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Long format: one row per value, so it opens cleanly in a spreadsheet. Columns: section,index,start_seconds,end_seconds,name,value */
export function reportToCsv(r: Report): string {
  const rows: unknown[][] = [["section", "index", "start_seconds", "end_seconds", "name", "value"]];
  const add = (section: string, name: string, value: unknown, index: unknown = "", start: unknown = "", end: unknown = "") => rows.push([section, index, start, end, name, value]);
  add("report", "generated_at", r.generated_at);
  for (const [k, v] of Object.entries(r.audio)) add("audio", k, v);
  for (const [k, v] of Object.entries(r.model)) add("model", k, v);
  add("prediction", "closest_emotion", r.prediction.closest_emotion);
  add("prediction", "highest_score", r.prediction.highest_score);
  add("prediction", "score_type", r.prediction.score_type);
  for (const [k, v] of Object.entries(r.prediction.scores)) add("overall_score", k, v);
  r.notes.forEach((n) => add("note", "note", n));
  r.timeline?.segments.forEach((s) => {
    add("segment_status", "status", s.status, s.index, s.start, s.end);
    if (s.scores) for (const [k, v] of Object.entries(s.scores)) add("segment_score", k, v, s.index, s.start, s.end);
  });
  if (r.transcript) add("transcript", "text", r.transcript.text);
  r.limitations.forEach((l) => add("limitation", "limitation", l));
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
