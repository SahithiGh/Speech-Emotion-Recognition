import { useEffect, useRef } from "react";
import { AlertTriangle, Scale, X, Check } from "lucide-react";
import type { PredictResult } from "../api";
import { label, pct } from "../format";

interface MismatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: PredictResult | null;
  filename?: string;
}

export default function MismatchModal({
  isOpen,
  onClose,
  result,
  filename,
}: MismatchModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    // Focus the acknowledge button on open for accessibility
    const timer = setTimeout(() => {
      actionButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !result || result.consistency?.status !== "divergent") {
    return null;
  }

  const cons = result.consistency;
  const vocalEmotion = result.emotion ? label(result.emotion) : "Unknown";
  const wordingPolarity = cons.text_affect?.polarity
    ? cons.text_affect.polarity.toUpperCase()
    : "DIVERGENT";
  const cues = cons.text_affect?.cues || [];

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="mismatch-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mismatch-modal-title"
        aria-describedby="mismatch-modal-desc"
        ref={modalRef}
      >
        <div className="mismatch-modal-header">
          <div className="mismatch-modal-title-wrap">
            <span className="mismatch-modal-icon-badge" aria-hidden="true">
              <AlertTriangle size={22} />
            </span>
            <div>
              <h2 id="mismatch-modal-title" className="mismatch-modal-title">
                Mismatch Detected
              </h2>
              {filename && <span className="mismatch-modal-filename">{filename}</span>}
            </div>
          </div>
          <button
            type="button"
            className="icon-link-btn mismatch-modal-close"
            onClick={onClose}
            aria-label="Close mismatch alert"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mismatch-modal-body">
          <p id="mismatch-modal-desc" className="mismatch-modal-lead">
            The emotional tone of the spoken transcript conflicts with the detected vocal acoustics.
          </p>

          <div className="mismatch-modal-signals-grid">
            <div className="mismatch-signal-box acoustic">
              <span className="mismatch-signal-label">Vocal Emotion (Acoustic)</span>
              <div className="mismatch-signal-val-wrap">
                <strong className={`emotion-pill emotion-${result.emotion ? result.emotion.toLowerCase() : "neutral"}`}>
                  {vocalEmotion}
                </strong>
                <span className="mismatch-signal-sub">
                  Confidence: {pct(result.confidence)}
                </span>
              </div>
            </div>

            <div className="mismatch-signal-box lexical">
              <span className="mismatch-signal-label">Wording Affect (Transcript)</span>
              <div className="mismatch-signal-val-wrap">
                <span className="mismatch-polarity-badge">
                  {wordingPolarity}
                </span>
                {cons.text_affect?.detected_emotions && cons.text_affect.detected_emotions.length > 0 && (
                  <span className="mismatch-signal-sub">
                    Lexical cues: {cons.text_affect.detected_emotions.join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {result.transcription?.text && (
            <div className="mismatch-modal-quote-wrap">
              <span className="mismatch-quote-label">Spoken Transcript:</span>
              <blockquote className="mismatch-modal-quote">
                "{result.transcription.text}"
              </blockquote>
            </div>
          )}

          {cues.length > 0 && (
            <div className="mismatch-modal-cues">
              <span className="mismatch-cues-label">Conflicting Sentiment Cues:</span>
              <div className="mismatch-cues-pills">
                {cues.map((cue, i) => (
                  <span key={i} className="mismatch-cue-pill">
                    {cue}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mismatch-modal-explanation">
            <p>{cons.explanation}</p>
          </div>

          <div className="mismatch-modal-guardrail">
            <Scale size={14} className="icon-subtle" aria-hidden="true" />
            <span>
              <strong>Methodological notice:</strong> Divergence between acoustic delivery and literal phrasing is a natural communicative nuance (such as irony, polite restraint, or professional understatement). It is never proof of deception or verified inner state.
            </span>
          </div>
        </div>

        <div className="mismatch-modal-footer">
          <button
            ref={actionButtonRef}
            type="button"
            className="btn primary"
            onClick={onClose}
          >
            <Check size={16} /> Acknowledge & View Details
          </button>
        </div>
      </div>
    </div>
  );
}

