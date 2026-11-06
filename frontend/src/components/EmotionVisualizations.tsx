import React, { useState } from "react";
import type { EmotionTrackPoint, EmotionJourneyBlock, ConversationTurn } from "../api";
import { EMOTION_COLORS } from "../site";

interface EmotionVisualizationsProps {
  duration: number;
  tracks?: Record<string, EmotionTrackPoint[]>;
  journey?: EmotionJourneyBlock[];
  turns?: ConversationTurn[];
  currentTime?: number;
  onSeek?: (seconds: number) => void;
  embedded?: boolean;
  isSingleSpeaker?: boolean;
}

const EMOTIONS = ["happy", "sad", "angry", "fear", "disgust", "neutral"] as const;

export const EmotionVisualizations: React.FC<EmotionVisualizationsProps> = ({
  duration,
  tracks: _tracks = {},
  journey = [],
  turns = [],
  currentTime = 0,
  onSeek,
  embedded = false,
  isSingleSpeaker = false,
}) => {
  const [activeTab, setActiveTab] = useState<"tracks" | "journey">("tracks");
  const effectiveDuration = Math.max(duration || 1.0, 1.0);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * effectiveDuration);
  };

  // Helper to extract segments for a specific emotion from speaker turns or fallback to journey blocks
  const getSegmentsForEmotion = (emo: string) => {
    if (turns && turns.length > 0) {
      return turns
        .filter((t) => (t.emotion || "").toLowerCase() === emo.toLowerCase())
        .map((t) => ({
          start: t.start,
          end: t.end,
          confidence: t.top_score ?? 0.75,
          speaker: t.speaker_name,
        }));
    }
    if (journey && journey.length > 0) {
      return journey
        .filter((b) => (b.emotion || "").toLowerCase() === emo.toLowerCase())
        .map((b) => ({
          start: b.start,
          end: b.end,
          confidence: b.confidence ?? 0.75,
          speaker: undefined,
        }));
    }
    return [];
  };

  return (
    <div className={embedded ? "emotion-vis-embedded" : "conv-panel"}>
      <div className="conv-panel-header" style={{ marginBottom: "0.85rem" }}>
        <div>
          {!embedded && (
            <h3 className="conv-panel-title">
              <span>Emotion Visualizations</span>
              <span className="conv-badge conv-badge-primary">
                {activeTab === "tracks" ? "Emotion Tracks (Default)" : "Emotion Journey (Alternative)"}
              </span>
            </h3>
          )}
          <p className="conv-panel-subtitle" style={{ margin: 0 }}>
            {activeTab === "tracks"
              ? "Continuous 6-class acoustic probability trajectories across the audio duration."
              : "Contiguous dominant emotion segments and temporal progression throughout the audio."}
          </p>
        </div>

        {/* View Toggle */}
        <div className="emotion-view-toggle">
          <button
            type="button"
            className={`emotion-toggle-btn ${activeTab === "tracks" ? "active" : ""}`}
            onClick={() => setActiveTab("tracks")}
          >
            Emotion Tracks
          </button>
          <button
            type="button"
            className={`emotion-toggle-btn ${activeTab === "journey" ? "active" : ""}`}
            onClick={() => setActiveTab("journey")}
          >
            Emotion Journey
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="emotion-legend-bar">
        {EMOTIONS.map((emo) => {
          const color = (EMOTION_COLORS as Record<string, string>)[emo] || "#E2E8F0";
          return (
            <div key={emo} className="emotion-legend-item">
              <span className="emotion-legend-dot" style={{ backgroundColor: color }} />
              <span>{emo}</span>
            </div>
          );
        })}
      </div>

      {activeTab === "tracks" ? (
        /* Emotion Tracks (Default): Multi-Track View with clean horizontal segmented bars */
        <div className="emotion-tracks-list" onClick={handleTimelineClick}>
          {EMOTIONS.map((emo) => {
            const segments = getSegmentsForEmotion(emo);
            const color = (EMOTION_COLORS as Record<string, string>)[emo] || "#E2E8F0";

            return (
              <div key={emo} className="emotion-track-row">
                <div className="emotion-track-label">
                  <span className="emotion-legend-dot" style={{ backgroundColor: color }} />
                  <span>{emo}</span>
                </div>

                <div
                  className="emotion-track-canvas"
                  style={{ height: "32px", maxHeight: "32px", position: "relative", overflow: "hidden" }}
                >
                  {/* Playhead */}
                  {currentTime > 0 && (
                    <div
                      className="conv-playhead"
                      style={{
                        left: `${Math.min(100, (currentTime / effectiveDuration) * 100)}%`,
                        height: "100%",
                      }}
                    />
                  )}

                  {/* Horizontal Segmented Bars */}
                  {segments.length > 0 ? (
                    segments.map((seg, sIdx) => {
                      const leftPct = (seg.start / effectiveDuration) * 100;
                      const widthPct = Math.max(1.0, ((seg.end - seg.start) / effectiveDuration) * 100);
                      const confPct = Math.round(seg.confidence * 100);
                      const tooltip = `${emo} (${confPct}%): ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s${
                        seg.speaker ? ` (${seg.speaker})` : ""
                      }`;

                      return (
                        <div
                          key={sIdx}
                          className="emo-track-segment"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            backgroundColor: color,
                            opacity: Math.max(0.7, Math.min(1, seg.confidence)),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSeek) onSeek(seg.start);
                          }}
                          title={tooltip}
                        >
                          {widthPct > 8 && (
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "#111827" }}>
                              {confPct}%
                            </span>
                          )}
                          {widthPct > 16 && !isSingleSpeaker && seg.speaker && (
                            <span style={{ fontSize: "10px", fontWeight: 600, color: "#111827", opacity: 0.9 }}>
                              {seg.speaker}
                            </span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <span className="emo-track-empty">No {emo} detected</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Emotion Journey (Alternative): Dominant Blocks */
        <div className="emotion-journey-wrapper" onClick={handleTimelineClick}>
          {/* Playhead */}
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

          <div
            className="emotion-journey-track"
            style={{ height: "48px", maxHeight: "48px", position: "relative", overflow: "hidden" }}
          >
            {journey.map((block, idx) => {
              const leftPct = (block.start / effectiveDuration) * 100;
              const widthPct = Math.max(1.0, ((block.end - block.start) / effectiveDuration) * 100);
              const color = (EMOTION_COLORS as Record<string, string>)[block.emotion] || "#E2E8F0";

              return (
                <div
                  key={idx}
                  className="emotion-journey-block"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: color,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSeek) onSeek(block.start);
                  }}
                  title={`${block.emotion} (${(block.confidence * 100).toFixed(0)}%): ${block.start.toFixed(1)}s - ${block.end.toFixed(1)}s`}
                >
                  <span style={{ textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {block.emotion}
                  </span>
                  <span style={{ fontSize: "10px", fontWeight: "normal", opacity: 0.85 }}>
                    {block.start.toFixed(1)}s-{block.end.toFixed(1)}s
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Axis Rulers */}
      <div className="conv-axis-row">
        <span>0:00</span>
        <span>{(effectiveDuration * 0.25).toFixed(1)}s</span>
        <span>{(effectiveDuration * 0.5).toFixed(1)}s</span>
        <span>{(effectiveDuration * 0.75).toFixed(1)}s</span>
        <span>{effectiveDuration.toFixed(1)}s</span>
      </div>
    </div>
  );
};
