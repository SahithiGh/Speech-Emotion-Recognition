import { useState } from "react";
import type { TimelineLimits, TimelineResult, Transcript as T } from "../api";
import type { Source } from "../types";
import Spectrogram from "./Spectrogram";
import Timeline from "./Timeline";
import Transcript from "./Transcript";

interface Props { source: Source; modelReady: boolean; limits?: TimelineLimits; timeline: TimelineResult | null; onTimeline: (t: TimelineResult | null) => void; transcript: T | null; onTranscript: (t: T | null) => void }

/** Optional deeper views, collapsed by default so the main analysis stays uncluttered. Content loads only when a section is opened. */
export default function AdvancedPanels(p: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => (e: React.SyntheticEvent<HTMLDetailsElement>) => { const o = e.currentTarget.open; setOpen((s) => ({ ...s, [k]: o })); };
  return (
    <div className="advanced">
      <h2>Advanced views</h2>
      <details onToggle={toggle("spec")}><summary>Spectrogram</summary>{open.spec && <Spectrogram source={p.source} />}</details>
      <details onToggle={toggle("tl")}><summary>Emotion timeline (segments)</summary>{open.tl && <Timeline source={p.source} ready={p.modelReady} limits={p.limits} result={p.timeline} onResult={p.onTimeline} />}</details>
      <details onToggle={toggle("tr")}><summary>Transcript (optional)</summary>{open.tr && <Transcript source={p.source} result={p.transcript} onResult={p.onTranscript} />}</details>
    </div>
  );
}
