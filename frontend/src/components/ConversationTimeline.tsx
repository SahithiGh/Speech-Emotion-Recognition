import React from "react";
import type { ConversationTurn, SpeakerInfo } from "../api";
import { EMOTION_COLORS } from "../site";

interface ConversationTimelineProps {
  duration: number;
  speakers: SpeakerInfo[];
  turns: ConversationTurn[];
  currentTime?: number;
  onSeek?: (seconds: number) => void;
  embedded?: boolean;
}

const SPEAKER_LANE_COLORS: Record<string, { bg: string; border: string; text: string; fill: string }> = {
  spk_A: { bg: "rgba(37, 99, 235, 0.12)", border: "#2563EB", text: "#1D4ED8", fill: "#3B82F6" },
  spk_B: { bg: "rgba(5, 150, 105, 0.12)", border: "#059669", text: "#047857", fill: "#10B981" },
  spk_C: { bg: "rgba(217, 119, 6, 0.12)", border: "#D97706", text: "#B45309", fill: "#F59E0B" },
  spk_D: { bg: "rgba(109, 40, 217, 0.12)", border: "#6D28D9", text: "#5B21B6", fill: "#8B5CF6" },
};

function getSpeakerColor(speakerId: string) {
  return SPEAKER_LANE_COLORS[speakerId] || {
    bg: "rgba(75, 85, 99, 0.12)",
    border: "#4B5563",
    text: "#374151",
    fill: "#6B7280",
  };
}

export const ConversationTimeline: React.FC<ConversationTimelineProps> = ({
  duration,
  speakers,
  turns,
  currentTime = 0,
  onSeek,
  embedded = false,
}) => {
  const effectiveDuration = Math.max(duration || 1.0, 1.0);

  // Group turns by speaker
  const speakerLanes = React.useMemo(() => {
    if (!speakers || speakers.length === 0) {
      // Derive speakers from turns if speakers array empty
      const uniqueIds = Array.from(new Set(turns.map((t) => t.speaker_id)));
      return uniqueIds.map((id) => ({
        speaker_id: id,
        name: turns.find((t) => t.speaker_id === id)?.speaker_name || id,
        turns: turns.filter((t) => t.speaker_id === id),
      }));
    }
    return speakers.map((spk) => ({
      speaker_id: spk.speaker_id,
      name: spk.name || spk.label || spk.speaker_id,
      turns: turns.filter((t) => t.speaker_id === spk.speaker_id),
    }));
  }, [speakers, turns]);

  // Identify overlap intervals
  const overlaps = React.useMemo(() => {
    const intervals: { start: number; end: number }[] = [];
    for (let i = 0; i < turns.length; i++) {
      for (let j = i + 1; j < turns.length; j++) {
        if (turns[i].speaker_id !== turns[j].speaker_id) {
          const oStart = Math.max(turns[i].start, turns[j].start);
          const oEnd = Math.min(turns[i].end, turns[j].end);
          if (oEnd - oStart > 0.05) {
            intervals.push({ start: oStart, end: oEnd });
          }
        }
      }
    }
    return intervals;
  }, [turns]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * effectiveDuration);
  };

  return (
    <div className={embedded ? "conversation-timeline-embedded" : "conv-panel"} style={{ marginBottom: embedded ? "1.25rem" : undefined }}>
      <div className="conv-panel-header" style={{ marginBottom: "0.75rem" }}>
        <div>
          {!embedded ? (
            <h3 className="conv-panel-title">
              <span>Combined Conversation Timeline</span>
              <span className="conv-badge conv-badge-primary">
                {speakerLanes.length} {speakerLanes.length === 1 ? "Speaker" : "Speakers"}
              </span>
              {overlaps.length > 0 && (
                <span className="conv-badge conv-badge-overlap">
                  {overlaps.length} Overlapping {overlaps.length === 1 ? "Turn" : "Turns"}
                </span>
              )}
            </h3>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.2rem" }}>
              <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--color-foreground)" }}>
                Speaking Turns Timeline
              </span>
              {overlaps.length > 0 && (
                <span className="conv-badge conv-badge-overlap">
                  {overlaps.length} Overlapping {overlaps.length === 1 ? "Turn" : "Turns"}
                </span>
              )}
            </div>
          )}
          <p className="conv-panel-subtitle" style={{ margin: 0 }}>
            Synchronized multi-lane conversation structure. Click any turn or lane position to seek the audio recording.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: "rgba(37, 99, 235, 0.2)", border: "1px solid #2563EB" }} />
            <span>Active Turn</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: "rgba(245, 158, 11, 0.25)", border: "1px solid #F59E0B" }} />
            <span>Overlap</span>
          </div>
        </div>
      </div>

      {/* Main Timeline View */}
      <div className="conv-timeline-box" onClick={handleTimelineClick}>
        {/* Playhead Indicator */}
        {currentTime > 0 && (
          <div
            className="conv-playhead"
            style={{
              left: `${Math.min(100, (currentTime / effectiveDuration) * 100)}%`,
              height: "100%",
            }}
          >
            <div className="conv-playhead-knob" />
          </div>
        )}

        {/* Overlap Highlights Underlay */}
        {overlaps.map((ov, idx) => {
          const leftPct = (ov.start / effectiveDuration) * 100;
          const widthPct = Math.max(0.5, ((ov.end - ov.start) / effectiveDuration) * 100);
          return (
            <div
              key={`ov-${idx}`}
              className="conv-overlap-indicator"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              title={`Simultaneous speech: ${ov.start.toFixed(1)}s - ${ov.end.toFixed(1)}s`}
            />
          );
        })}

        {/* Speaker Lanes */}
        <div className="conv-lanes-container">
          {speakerLanes.map((lane) => {
            const sc = getSpeakerColor(lane.speaker_id);
            return (
              <div key={lane.speaker_id} className="conv-lane-row">
                <div className="conv-lane-label" title={lane.name}>
                  <span className="emotion-legend-dot" style={{ backgroundColor: sc.border }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lane.name}</span>
                </div>

                <div
                  className="conv-lane-track"
                  style={{ height: "32px", maxHeight: "32px", position: "relative", overflow: "hidden" }}
                >
                  {lane.turns.map((turn, tIdx) => {
                    const leftPct = (turn.start / effectiveDuration) * 100;
                    const widthPct = Math.max(1.0, ((turn.end - turn.start) / effectiveDuration) * 100);
                    const emoColor = turn.emotion ? (EMOTION_COLORS as Record<string, string>)[turn.emotion] || sc.border : sc.border;

                    return (
                      <div
                        key={tIdx}
                        className="conv-turn-block"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: sc.bg,
                          borderColor: sc.border,
                          color: sc.text,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSeek) onSeek(turn.start);
                        }}
                        title={`${lane.name}: ${turn.start.toFixed(1)}s - ${turn.end.toFixed(1)}s (${turn.emotion || "speech"})`}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                          {turn.emotion || "speech"}
                        </span>
                        {turn.top_score && (
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              flexShrink: 0,
                              backgroundColor: emoColor,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timeline Axis Rulers */}
        <div className="conv-axis-row">
          <span>0:00</span>
          <span>{(effectiveDuration * 0.25).toFixed(1)}s</span>
          <span>{(effectiveDuration * 0.5).toFixed(1)}s</span>
          <span>{(effectiveDuration * 0.75).toFixed(1)}s</span>
          <span>{effectiveDuration.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
};
