import { useState } from "react";
import type { TimelineLimits, TimelineResult } from "../api";
import type { Source } from "../types";
import Spectrogram from "./Spectrogram";
import Timeline from "./Timeline";
import { ChevronDown, Sliders, Activity } from "lucide-react";

interface Props {
  source: Source;
  modelReady: boolean;
  limits?: TimelineLimits;
  timeline: TimelineResult | null;
  onTimeline: (t: TimelineResult | null) => void;
  transcript?: unknown;
  onTranscript?: (t: any) => void;
}

/** Optional deeper views, collapsed by default so the main analysis stays uncluttered. Content loads only when a section is opened. */
export default function AdvancedPanels(p: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const o = e.currentTarget.open;
    setOpen((s) => ({ ...s, [k]: o }));
  };

  return (
    <div className="advanced">
      <h2>Advanced Views</h2>
      <details onToggle={toggle("spec")}>
        <summary>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <Activity size={16} /> Frequency Spectrogram
          </span>
          <ChevronDown size={16} className="details-chevron" />
        </summary>
        {open.spec && <Spectrogram source={p.source} />}
      </details>
      <details onToggle={toggle("tl")}>
        <summary>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <Sliders size={16} /> Segment Timeline Analysis
          </span>
          <ChevronDown size={16} className="details-chevron" />
        </summary>
        {open.tl && (
          <Timeline
            source={p.source}
            ready={p.modelReady}
            limits={p.limits}
            result={p.timeline}
            onResult={p.onTimeline}
          />
        )}
      </details>
    </div>
  );
}
