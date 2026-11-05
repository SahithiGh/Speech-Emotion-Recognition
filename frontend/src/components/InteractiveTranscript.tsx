import { useState } from "react";
import { Check, CheckCircle2, Edit3, MessageSquare, Play, RefreshCw, X, AlertCircle, AlertTriangle } from "lucide-react";
import type { PredictResult, ConsistencyResult, TranscriptSegment, TranscriptWord } from "../api";
import { recalculateConsistency } from "../api";
import { label } from "../format";

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
            {hasWordTimestamps ? "Word-Level Alignment (Whisper)" : "Segment-Level Alignment"}
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

          {/* Interactive Word and Segment Timestamps */}
          {segments.length > 0 && (
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
          )}
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
