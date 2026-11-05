import React, { useState } from "react";
import { Play } from "lucide-react";
import type { SpeakerInfo, ConversationTurn } from "../api";
import { EMOTION_COLORS } from "../site";

interface SpeakerAnalysisViewProps {
  speakers: SpeakerInfo[];
  turns: ConversationTurn[];
  onRenameSpeaker?: (speakerId: string, newName: string) => void;
  onSeek?: (seconds: number) => void;
  embedded?: boolean;
}

const EMOTIONS = ["happy", "sad", "angry", "fear", "disgust", "neutral"] as const;

export const SpeakerAnalysisView: React.FC<SpeakerAnalysisViewProps> = ({
  speakers,
  turns,
  onRenameSpeaker,
  onSeek,
  embedded = false,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);

  const startRename = (speaker: SpeakerInfo) => {
    setEditingId(speaker.speaker_id);
    setTempName(speaker.name || speaker.label || speaker.speaker_id);
  };

  const saveRename = (speakerId: string) => {
    if (tempName.trim() && onRenameSpeaker) {
      onRenameSpeaker(speakerId, tempName.trim());
    }
    setEditingId(null);
  };

  if (!speakers || speakers.length === 0) {
    return null;
  }

  const selectedSpeaker = speakers.find((s) => s.speaker_id === selectedSpeakerId);
  const selectedSpeakerTurns = selectedSpeaker
    ? turns.filter((t) => t.speaker_id === selectedSpeaker.speaker_id)
    : [];

  return (
    <div className={embedded ? "speaker-analysis-embedded" : "conv-panel"}>
      <div className="conv-panel-header" style={{ marginBottom: "0.75rem" }}>
        <div>
          {!embedded ? (
            <h3 className="conv-panel-title">
              <span>Individual Speaker Analysis</span>
              <span className="conv-badge conv-badge-primary">
                {speakers.length} {speakers.length === 1 ? "Speaker Detected" : "Speakers Detected"}
              </span>
            </h3>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.2rem" }}>
              <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--color-foreground)" }}>
                Detected Speaker Profiles
              </span>
              <span className="conv-badge conv-badge-primary">
                {speakers.length} {speakers.length === 1 ? "Speaker" : "Speakers"}
              </span>
            </div>
          )}
          <p className="conv-panel-subtitle" style={{ margin: 0 }}>
            Speaker participation, dominant emotional states, emotion distribution, and physical vocal metrics.
          </p>
        </div>
      </div>

      {/* Speaker Cards Grid */}
      <div className="speakers-grid">
        {speakers.map((spk) => {
          const domColor = (EMOTION_COLORS as Record<string, string>)[spk.dominant_emotion] || "#E2E8F0";
          const isEditing = editingId === spk.speaker_id;
          const spkTurns = turns.filter((t) => t.speaker_id === spk.speaker_id);
          const firstTurn = spkTurns.length > 0 ? spkTurns[0] : null;

          return (
            <div key={spk.speaker_id} className="speaker-card">
              <div>
                {/* Header: Name and Dominant Emotion */}
                <div className="speaker-card-header">
                  {isEditing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flex: 1, marginRight: "0.5rem" }}>
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          border: "1px solid var(--color-primary)",
                          background: "var(--color-surface)",
                          color: "var(--color-foreground)",
                          width: "100%",
                        }}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(spk.speaker_id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(spk.speaker_id)}
                        className="btn sm primary"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="btn sm sub"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <h4 className="speaker-card-name">{spk.name}</h4>
                      {onRenameSpeaker && (
                        <button
                          type="button"
                          onClick={() => startRename(spk)}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            color: "var(--color-muted-foreground)",
                            padding: "0.1rem 0.3rem",
                          }}
                          title="Rename speaker"
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  )}

                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "0.2rem 0.6rem",
                      borderRadius: "9999px",
                      textTransform: "capitalize",
                      color: "#160709",
                      backgroundColor: domColor,
                      border: "1px solid rgba(0,0,0,0.12)",
                    }}
                  >
                    {spk.dominant_emotion}
                  </span>
                </div>

                {/* Participation stats */}
                <div className="speaker-metrics-trio">
                  <div>
                    <span className="speaker-metric-label">Speaking Time</span>
                    <span className="speaker-metric-val">{spk.speaking_seconds.toFixed(1)}s</span>
                  </div>
                  <div>
                    <span className="speaker-metric-label">Speech Share</span>
                    <span className="speaker-metric-val">{spk.speaking_percentage.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="speaker-metric-label">Turns</span>
                    <span className="speaker-metric-val">{spk.segment_count}</span>
                  </div>
                </div>

                {/* Emotion Distribution Bars */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted-foreground)", display: "block" }}>
                    Acoustic Emotion Profile:
                  </span>
                  <div className="speaker-dist-bar">
                    {EMOTIONS.map((emo) => {
                      const pct = spk.emotion_distribution?.[emo] || 0;
                      if (pct <= 0) return null;
                      const c = (EMOTION_COLORS as Record<string, string>)[emo] || "#E2E8F0";
                      return (
                        <div
                          key={emo}
                          style={{ width: `${pct}%`, backgroundColor: c, height: "100%" }}
                          title={`${emo}: ${pct.toFixed(1)}%`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Voice Metrics Summary */}
                {spk.voice_metrics && (
                  <div className="speaker-voice-summary">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Mean Pitch (F₀):</span>
                      <span style={{ fontWeight: 600, color: "var(--color-foreground)" }}>
                        {spk.voice_metrics.mean_pitch_hz && spk.voice_metrics.mean_pitch_hz > 0
                          ? `${spk.voice_metrics.mean_pitch_hz.toFixed(0)} Hz`
                          : "N/A (unvoiced)"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Mean Vocal Energy:</span>
                      <span style={{ fontWeight: 600, color: "var(--color-foreground)" }}>
                        {spk.voice_metrics.mean_energy_db
                          ? `${spk.voice_metrics.mean_energy_db.toFixed(1)} dB`
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Playback Controls & Drill-down */}
              <div className="speaker-card-actions">
                {firstTurn && onSeek && (
                  <button
                    type="button"
                    onClick={() => onSeek(firstTurn.start)}
                    className="btn sm sub"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                    title={`Seek and play ${spk.name}'s turns starting at ${firstTurn.start.toFixed(1)}s`}
                  >
                    <Play size={12} fill="currentColor" aria-hidden="true" /> Play Speaker
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedSpeakerId(spk.speaker_id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-primary)",
                  }}
                >
                  View Turns ({spkTurns.length}) →
                </button>
              </div>

              <div style={{ marginTop: "0.45rem", fontSize: "0.68rem", color: "var(--color-muted-foreground)", fontStyle: "italic" }}>
                Plays speaker turns from the recording (diarization segment playback).
              </div>
            </div>
          );
        })}
      </div>

      {/* Drill-down Modal / Drawer */}
      {selectedSpeaker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setSelectedSpeakerId(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "85vh",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "16px",
              padding: "1.5rem",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "0.75rem", borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--color-foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>{selectedSpeaker.name}</span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "0.2rem 0.6rem",
                      borderRadius: "9999px",
                      textTransform: "capitalize",
                      color: "#160709",
                      backgroundColor: (EMOTION_COLORS as Record<string, string>)[selectedSpeaker.dominant_emotion] || "#E2E8F0",
                      border: "1px solid rgba(0,0,0,0.12)",
                    }}
                  >
                    {selectedSpeaker.dominant_emotion}
                  </span>
                </h3>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "var(--color-muted-foreground)" }}>
                  Speaking time: {selectedSpeaker.speaking_seconds.toFixed(1)}s ({selectedSpeaker.speaking_percentage.toFixed(1)}% of speech) across {selectedSpeaker.segment_count} turns
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSpeakerId(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  color: "var(--color-muted-foreground)",
                  padding: "0.2rem 0.5rem",
                }}
              >
                ✕
              </button>
            </div>

            {/* Turn List */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.6rem", paddingRight: "0.25rem" }}>
              {selectedSpeakerTurns.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--color-muted-foreground)", textAlign: "center", padding: "1.5rem" }}>
                  No turn segments recorded for this speaker.
                </p>
              ) : (
                selectedSpeakerTurns.map((turn, idx) => {
                  const turnColor = turn.emotion ? (EMOTION_COLORS as Record<string, string>)[turn.emotion] || "#E2E8F0" : "#E2E8F0";

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: "0.75rem 1rem",
                        borderRadius: "10px",
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface-muted)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        fontSize: "0.8rem",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-foreground)", fontWeight: 600 }}>
                            {turn.start.toFixed(1)}s - {turn.end.toFixed(1)}s
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--color-muted-foreground)" }}>
                            ({(turn.end - turn.start).toFixed(1)}s)
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ color: "var(--color-muted-foreground)" }}>Emotion:</span>
                          <span
                            style={{
                              fontWeight: 700,
                              padding: "0.15rem 0.5rem",
                              borderRadius: "4px",
                              textTransform: "capitalize",
                              color: "#160709",
                              backgroundColor: turnColor,
                              border: "1px solid rgba(0,0,0,0.1)",
                              fontSize: "0.72rem",
                            }}
                          >
                            {turn.emotion || "speech"}
                          </span>
                          {turn.top_score && (
                            <span style={{ color: "var(--color-muted-foreground)", fontSize: "0.72rem" }}>
                              {(turn.top_score * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>

                      {onSeek && (
                        <button
                          type="button"
                          onClick={() => {
                            onSeek(turn.start);
                            setSelectedSpeakerId(null);
                          }}
                          className="btn sm primary"
                          style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        >
                          <Play size={12} fill="currentColor" aria-hidden="true" /> Play
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setSelectedSpeakerId(null)}
                className="btn sm sub"
                style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
