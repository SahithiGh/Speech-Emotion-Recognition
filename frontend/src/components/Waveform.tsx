import React from "react";

interface WaveformProps {
  peaks: number[];
  currentTime?: number;
  duration?: number;
  onSeek?: (timeSeconds: number) => void;
}

/** Draws real peak data from the loaded audio with synchronized playback progress and click-to-seek. */
export function Waveform({ peaks, currentTime = 0, duration = 0, onSeek }: WaveformProps) {
  const w = peaks.length * 5;
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const currentX = progressRatio * w;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSeek || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, clickX / rect.width));
    onSeek(pct * duration);
  };

  return (
    <div
      className="waveform-container"
      style={{ position: "relative", cursor: onSeek && duration > 0 ? "pointer" : "default" }}
      title={duration > 0 ? "Click to jump playback position" : undefined}
    >
      <svg
        className="waveform"
        viewBox={`0 0 ${w} 60`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Waveform of your audio with playback progress"
        onClick={handleClick}
      >
        {peaks.map((p, i) => {
          const barX = i * 5 + 0.5;
          const isPlayed = duration > 0 && barX <= currentX;
          return (
            <rect
              key={i}
              x={barX}
              y={30 - Math.max(1.5, p * 28)}
              width="3.2"
              height={Math.max(3, p * 56)}
              rx="1.2"
              className={isPlayed ? "waveform-bar-played" : "waveform-bar-unplayed"}
              style={{
                fill: isPlayed ? "var(--color-primary, #C4536E)" : "var(--color-chart-bar, #4E5D9F)",
                opacity: isPlayed ? 1.0 : 0.65,
                transition: "fill 0.1s ease, opacity 0.1s ease",
              }}
            />
          );
        })}
        {duration > 0 && (
          <line
            x1={currentX}
            y1={0}
            x2={currentX}
            y2={60}
            stroke="var(--color-primary, #C4536E)"
            strokeWidth="2.5"
          />
        )}
      </svg>
    </div>
  );
}

export function LevelMeter({ level, active }: { level: number; active: boolean }) {
  return (
    <div className="meter" role="img" aria-label={active ? `Microphone level ${Math.round(level * 100)} percent` : "Microphone level"}>
      <div className="meter-fill" style={{ width: `${active ? level * 100 : 0}%` }} />
    </div>
  );
}
