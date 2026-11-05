import { ArrowLeftRight, MessageSquare, Scale, Volume2, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PredictResult } from "../api";
import { label, pct, secs } from "../format";

export interface ComparisonTarget {
  name: string;
  url?: string;
  result: PredictResult;
  analyzedSeconds: number;
}

interface AnalysisComparisonProps {
  itemA: ComparisonTarget;
  itemB: ComparisonTarget;
  onClose: () => void;
}

export default function AnalysisComparison({ itemA, itemB, onClose }: AnalysisComparisonProps) {
  const resA = itemA.result;
  const resB = itemB.result;

  return (
    <div className="card comparison-container" role="region" aria-label="Side-by-side Recording Comparison">
      <div className="comparison-header">
        <div className="comparison-title-wrap">
          <ArrowLeftRight size={22} className="icon-accent" />
          <div>
            <h3 className="comparison-heading">Side-by-Side Acoustic & Lexical Comparison</h3>
            <p className="hint">Direct comparison of acoustic vocal patterns, transcripts, and cross-modal consistency.</p>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close comparison">
          <X size={18} />
        </button>
      </div>

      <div className="comparison-columns">
        {/* Column A */}
        <div className="comparison-col">
          <div className="col-badge">Recording A</div>
          <h4 className="col-filename">{itemA.name}</h4>
          {itemA.url && (
            <audio controls src={itemA.url} className="comparison-audio" aria-label={`Audio for ${itemA.name}`} />
          )}

          {/* Vocal Emotion */}
          <div className="comp-section">
            <span className="comp-label">Vocal Emotion</span>
            <div className="comp-emotion-val">
              <strong className={`emotion-pill emotion-${resA.emotion ? resA.emotion.toLowerCase() : "neutral"}`}>
                {resA.emotion ? label(resA.emotion) : "N/A"}
              </strong>
              <span className="comp-subtext">Confidence: {pct(resA.confidence)} (margin: {pct(resA.margin)})</span>
            </div>
          </div>

          {/* Transcript */}
          <div className="comp-section">
            <span className="comp-label">
              <MessageSquare size={14} /> Transcript
            </span>
            <p className="comp-transcript-quote">
              {resA.transcription?.text ? `"${resA.transcription.text}"` : <span className="muted">No transcript</span>}
            </p>
          </div>

          {/* Cross-modal Consistency */}
          <div className="comp-section">
            <span className="comp-label">
              <Scale size={14} /> Cross-Modal Consistency
            </span>
            <div
              className={`consistency-tag ${
                resA.consistency?.status === "divergent"
                  ? "consistency-tag-divergent"
                  : resA.consistency?.status === "consistent"
                  ? "consistency-tag-consistent"
                  : ""
              }`}
            >
              <strong className={`consistency-badge ${resA.consistency?.status || "inconclusive"}`}>
                {resA.consistency?.status === "divergent" && <AlertTriangle size={13} className="inline-icon" />}
                {resA.consistency?.status === "consistent" && <CheckCircle2 size={13} className="inline-icon" />}
                {resA.consistency?.display_label || "Insufficient Evidence"}
              </strong>
              <p className="comp-subtext">{resA.consistency?.explanation}</p>
            </div>
          </div>

          {/* Audio Quality & Duration */}
          <div className="comp-section">
            <span className="comp-label">
              <Volume2 size={14} /> Clip Metrics
            </span>
            <ul className="comp-metrics-list">
              <li>Analyzed duration: <strong>{secs(resA.analyzed_seconds)}</strong></li>
              <li>Model: <strong>{resA.model.name || "CREMA-D Classifier"}</strong></li>
              {resA.notes.map((n, i) => (
                <li key={i} className="comp-note">{n}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Column B */}
        <div className="comparison-col">
          <div className="col-badge col-badge-b">Recording B</div>
          <h4 className="col-filename">{itemB.name}</h4>
          {itemB.url && (
            <audio controls src={itemB.url} className="comparison-audio" aria-label={`Audio for ${itemB.name}`} />
          )}

          {/* Vocal Emotion */}
          <div className="comp-section">
            <span className="comp-label">Vocal Emotion</span>
            <div className="comp-emotion-val">
              <strong className={`emotion-pill emotion-${resB.emotion ? resB.emotion.toLowerCase() : "neutral"}`}>
                {resB.emotion ? label(resB.emotion) : "N/A"}
              </strong>
              <span className="comp-subtext">Confidence: {pct(resB.confidence)} (margin: {pct(resB.margin)})</span>
            </div>
          </div>

          {/* Transcript */}
          <div className="comp-section">
            <span className="comp-label">
              <MessageSquare size={14} /> Transcript
            </span>
            <p className="comp-transcript-quote">
              {resB.transcription?.text ? `"${resB.transcription.text}"` : <span className="muted">No transcript</span>}
            </p>
          </div>

          {/* Cross-modal Consistency */}
          <div className="comp-section">
            <span className="comp-label">
              <Scale size={14} /> Cross-Modal Consistency
            </span>
            <div
              className={`consistency-tag ${
                resB.consistency?.status === "divergent"
                  ? "consistency-tag-divergent"
                  : resB.consistency?.status === "consistent"
                  ? "consistency-tag-consistent"
                  : ""
              }`}
            >
              <strong className={`consistency-badge ${resB.consistency?.status || "inconclusive"}`}>
                {resB.consistency?.status === "divergent" && <AlertTriangle size={13} className="inline-icon" />}
                {resB.consistency?.status === "consistent" && <CheckCircle2 size={13} className="inline-icon" />}
                {resB.consistency?.display_label || "Insufficient Evidence"}
              </strong>
              <p className="comp-subtext">{resB.consistency?.explanation}</p>
            </div>
          </div>

          {/* Audio Quality & Duration */}
          <div className="comp-section">
            <span className="comp-label">
              <Volume2 size={14} /> Clip Metrics
            </span>
            <ul className="comp-metrics-list">
              <li>Analyzed duration: <strong>{secs(resB.analyzed_seconds)}</strong></li>
              <li>Model: <strong>{resB.model.name || "CREMA-D Classifier"}</strong></li>
              {resB.notes.map((n, i) => (
                <li key={i} className="comp-note">{n}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="ethical-guardrail-note" style={{ marginTop: "1.5rem" }}>
        <AlertTriangle size={15} />
        <span>
          <strong>Comparative Methodology Notice:</strong> Acoustic discrepancies reflect vocal delivery variations across recordings.
          This comparison does not diagnose emotional transitions, personality traits, or psychological veracity.
        </span>
      </div>
    </div>
  );
}
