import { useState } from "react";
import { Check, CheckCircle2, Edit3, Globe, HelpCircle, MessageSquare, Play, RefreshCw, X, AlertCircle, AlertTriangle } from "lucide-react";
import type { PredictResult, ConsistencyResult, TranscriptSegment, TranscriptWord, CombinedTranscriptItem } from "../api";
import { recalculateConsistency } from "../api";
import { label } from "../format";
import { EMOTION_COLORS } from "../site";

interface InteractiveTranscriptProps {
  result: PredictResult;
  onUpdateResult: (updated: PredictResult) => void;
  onSeekAndPlay?: (timeSeconds: number) => void;
}

export default function InteractiveTranscript({
  result,
  onUpdateResult,
  onSeekAndPlay,
}: InteractiveTranscriptProps) {
  const trans = result.transcription;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(trans?.text || "");
  const [recalculating, setRecalculating] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trans) {
    return null;
  }

  const handleSaveEdit = async () => {
    if (!editText.trim()) {
      setError("Transcript cannot be empty.");
      return;
    }
    setRecalculating(true);
    setError(null);
    try {
      // Recalculate text affect and consistency with the new transcript
      const newConsistency: ConsistencyResult = await recalculateConsistency({
        transcript: editText.trim(),
        predicted_emotion: result.emotion || "neutral",
        confidence: result.confidence,
        is_uncertain: result.uncertain,
      });

      const updated: PredictResult = {
        ...result,
        transcription: {
          ...trans,
          text: editText.trim(),
        },
        consistency: newConsistency,
      };

      onUpdateResult(updated);
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to recalculate consistency.");
    } finally {
      setRecalculating(false);
    }
  };

  const handleCancel = () => {
    setEditText(trans.text || "");
    setEditing(false);
    setError(null);
  };

  const segments: TranscriptSegment[] = trans.segments || [];
  const hasWordTimestamps = Boolean(trans.has_word_timestamps || segments.some((s) => s.words && s.words.length > 0));

  return (
    <div className="card result-feature-card" style={{ marginTop: "1.5rem" }}>
      <div className="card-header-flex">
        <div className="card-title-group">
          <h3 className="feature-card-title">
            <MessageSquare size={20} className="icon-accent" /> Spoken Words Transcript & Timestamps
          </h3>
          <span className="transcript-align-badge">
            {trans.case === "B"
              ? `Language: ${trans.language_name || trans.language}`
              : trans.case === "C"
              ? "Language Identification"
              : hasWordTimestamps
              ? "Word-Level Alignment (Whisper)"
              : "Segment-Level Alignment"}
          </span>
        </div>

        <div className="card-actions-group">
          {trans.engine && (
            <span className="badge ok">
              <CheckCircle2 size={12} /> {trans.engine}
            </span>
          )}
          {!editing && trans.text && (
            <button
              className="btn sub sm"
              onClick={() => {
                setEditText(trans.text || "");
                setEditing(true);
              }}
              title="Edit transcript and recalculate cross-modal consistency"
            >
              <Edit3 size={14} /> Correct Transcript
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="transcript-edit-panel">
          <label htmlFor="transcript-editor" className="field-label">
            Correct Transcript Text (affects lexical sentiment and cross-modal consistency):
          </label>
          <textarea
            id="transcript-editor"
            className="transcript-textarea"
            rows={3}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            disabled={recalculating}
          />
          {error && (
            <div className="callout warn sm" role="alert">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          <div className="transcript-edit-actions">
            <button
              className="btn primary sm"
              onClick={handleSaveEdit}
              disabled={recalculating}
            >
              {recalculating ? (
                <>
                  <span className="spinner light" /> Recalculating...
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Save & Recalculate Consistency
                </>
              )}
            </button>
            <button
              className="btn sub sm"
              onClick={handleCancel}
              disabled={recalculating}
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      ) : trans.text ? (
        <div className="transcript-box">
          <blockquote
            className={`transcript-quote ${
              result.consistency?.status === "divergent" ? "transcript-quote-divergent" : ""
            }`}
          >
            "{trans.text}"
          </blockquote>

          {result.consistency?.status === "divergent" && (
            <div className="transcript-mismatch-callout" role="alert">
              <AlertTriangle size={15} />
              <div>
                <strong>Cross-Modal Mismatch Highlight:</strong> Acoustic delivery sounds{" "}
                <strong className={`emotion-pill sm emotion-${(result.emotion || "neutral").toLowerCase()}`}>
                  {label(result.emotion || "neutral")}
                </strong>
                , while transcript wording indicates{" "}
                <strong className="mismatch-polarity-text">{result.consistency.text_affect?.polarity || "divergent"}</strong> sentiment.
                {result.consistency.text_affect?.cues && result.consistency.text_affect.cues.length > 0 && (
                  <span> Mismatched cues: <em>{result.consistency.text_affect.cues.join(", ")}</em></span>
                )}
              </div>
            </div>
          )}

          {result.consistency?.status === "consistent" && (
            <div className="transcript-match-callout" role="status">
              <CheckCircle2 size={15} />
              <div>
                <strong>Acoustic & Lexical Match:</strong> Vocal tone and wording sentiment are mutually consistent (
                {result.consistency.text_affect?.polarity || "consistent"}).
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="callout ok sm" style={{ margin: "0.5rem 0" }}>
              <Check size={14} />
              <span>Transcript corrected. Lexical affect and cross-modal consistency updated!</span>
            </div>
          )}

          {/* Interactive Word, Segment, or Multi-Speaker Chronological Timestamps */}
          {trans.combined_transcript && trans.combined_transcript.length > 0 ? (
            <div className="transcript-interactive-timeline">
              <p className="interactive-hint">
                <Play size={13} /> Multi-Speaker Chronological Transcript. Click any segment or word to seek audio:
              </p>
              <div className="transcript-turns-list">
                {trans.combined_transcript.map((item: CombinedTranscriptItem, idx: number) => {
                  const spkLower = (item.speaker_name || item.speaker_id || "").toLowerCase();
                  const isA = spkLower.includes("a") || spkLower.includes("00") || spkLower === "0";
                  const isB = spkLower.includes("b") || spkLower.includes("01") || spkLower === "1";
                  const speakerBadgeClass = isA
                    ? "speaker-badge-a"
                    : isB
                    ? "speaker-badge-b"
                    : "speaker-badge-default";

                  return (
                    <div key={idx} className="transcript-turn-card">
                      <div className="transcript-turn-header">
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span className={`transcript-speaker-badge ${speakerBadgeClass}`}>
                            {item.speaker_name || item.speaker_id}
                          </span>
                          <button
                            type="button"
                            className="seg-time-btn"
                            onClick={() => onSeekAndPlay?.(item.start)}
                            title={`Play from ${item.start}s`}
                          >
                            <Play size={11} /> [{item.start}s - {item.end}s]
                          </button>
                        </div>
                        {item.emotion && (
                          <span
                            className="transcript-emotion-pill"
                            style={{
                              backgroundColor: (EMOTION_COLORS as Record<string, string>)[item.emotion] || "#E2E8F0",
                            }}
                          >
                            {item.emotion}
                          </span>
                        )}
                      </div>
                      {item.words && item.words.length > 0 ? (
                        <span className="word-pills">
                          {item.words.map((w: TranscriptWord, wIdx: number) => (
                            <button
                              key={wIdx}
                              type="button"
                              className="word-pill-btn"
                              onClick={() => onSeekAndPlay?.(w.start)}
                              title={`Jump to ${w.start}s`}
                            >
                              <span className="word-text">{w.word}</span>
                              <span className="word-ts">{w.start}s</span>
                            </button>
                          ))}
                        </span>
                      ) : (
                        <span className="seg-raw-text">
                          {item.text}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : segments.length > 0 ? (
            <div className="transcript-interactive-timeline">
              <p className="interactive-hint">
                <Play size={13} /> Click any timestamp or word to jump audio playback to that moment:
              </p>
              <div className="segments-list">
                {segments.map((seg, sIdx) => (
                  <div key={sIdx} className="segment-block">
                    <button
                      type="button"
                      className="seg-time-btn"
                      onClick={() => onSeekAndPlay?.(seg.start)}
                      title={`Play from ${seg.start}s`}
                    >
                      <Play size={11} /> [{seg.start}s - {seg.end}s]
                    </button>

                    {seg.words && seg.words.length > 0 ? (
                      <span className="word-pills">
                        {seg.words.map((w: TranscriptWord, wIdx: number) => (
                          <button
                            key={wIdx}
                            type="button"
                            className="word-pill-btn"
                            onClick={() => onSeekAndPlay?.(w.start)}
                            title={`Jump to ${w.start}s`}
                          >
                            <span className="word-text">{w.word}</span>
                            <span className="word-ts">{w.start}s</span>
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="seg-raw-text">{seg.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : trans.case === "B" ? (
        <div className="language-notice-box" role="status">
          <div className="language-notice-header">
            <Globe size={18} className="language-notice-icon" />
            <h4 className="language-notice-title">{trans.message || `Other language detected: ${trans.language_name || "Unknown"}`}</h4>
          </div>
          <p className="language-notice-desc">
            The spoken speech in this recording was identified as <strong>{trans.language_name || "a non-English language"}</strong>{trans.language_probability ? ` (confidence: ${Math.round(trans.language_probability * 100)}%)` : ""}. English transcription is omitted to prevent inaccurate text generation.
          </p>
          <div className="language-notice-footer">
            <CheckCircle2 size={14} className="icon-ok" />
            <span>Acoustic emotion recognition operates independently of spoken language and analyzed your vocal characteristics directly.</span>
          </div>
        </div>
      ) : trans.case === "C" ? (
        <div className="language-notice-box language-notice-box-neutral" role="status">
          <div className="language-notice-header">
            <HelpCircle size={18} className="language-notice-icon" />
            <h4 className="language-notice-title">{trans.message || "Language could not be confidently identified."}</h4>
          </div>
          <p className="language-notice-desc">
            The spoken language in this recording could not be identified with sufficient confidence. Guessed transcription is omitted to avoid inaccurate text generation.
          </p>
          <div className="language-notice-footer">
            <CheckCircle2 size={14} className="icon-ok" />
            <span>Acoustic emotion recognition operates independently of spoken language and analyzed your vocal characteristics directly.</span>
          </div>
        </div>
      ) : trans.no_speech ? (
        <p className="muted-text">No intelligible speech was recognized in this clip.</p>
      ) : trans.status === "unavailable" ? (
        <div className="callout info">
          <span>{trans.reason || "Transcription engine is not configured."}</span>
        </div>
      ) : trans.status === "failed" ? (
        <div className="callout warn">
          <span>Transcription failed for this clip: {trans.reason}</span>
        </div>
      ) : (
        <p className="muted-text">Transcript generated from local faster-whisper inference.</p>
      )}
    </div>
  );
}
