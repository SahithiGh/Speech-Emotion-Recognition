import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { DEFAULT_TIMELINE, getTimeline, type TimelineLimits, type TimelineResult } from "../api";
import { withUpload, type Source } from "../types";
import { label, pct } from "../format";
import ErrorText from "./ErrorText";

const WINDOWS = [1, 1.5, 2, 3, 4];

export default function Timeline({ source, ready, limits = DEFAULT_TIMELINE, result, onResult }:
  { source: Source; ready: boolean; limits?: TimelineLimits; result: TimelineResult | null; onResult: (r: TimelineResult | null) => void }) {
  const [win, setWin] = useState(limits.default_window);
  const [step, setStep] = useState(limits.default_step);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const windows = WINDOWS.filter((w) => w >= limits.min_window && w <= limits.max_window);
  const steps = [0.5, 1, 1.5, 2, 3, 4].filter((s) => s >= limits.min_step && s <= win);
  const run = async () => {
    setBusy(true); setError(null); setSel(null); onResult(null);
    try { onResult(await withUpload(source, (b, n) => getTimeline(b, n, win, step))); }
    catch (e) { setError(e instanceof Error ? e.message : "The timeline could not be created."); }
    finally { setBusy(false); }
  };
  if (!ready) return <p className="banner warn"><AlertTriangle size={18} aria-hidden="true" /><span>The timeline needs a trained model, which is not available yet. Train the model first (see the README).</span></p>;

  const lanes = result ? Math.max(1, Math.ceil(result.window_seconds / result.step_seconds)) : 1;
  const chosen = result && sel !== null ? result.segments[sel] : null;
  return (
    <div className="timeline">
      <p className="hint">The audio is cut into overlapping windows and the same model classifies each window. The model was trained on whole sentences and has not been tested on short windows, so these are rough estimates.</p>
      <div className="range-row">
        <label htmlFor="tl-win">Window length
          <select id="tl-win" value={win} onChange={(e) => { const w = Number(e.target.value); setWin(w); if (step > w) setStep(w); }}>{windows.map((w) => <option key={w} value={w}>{w} s</option>)}</select></label>
        <label htmlFor="tl-step">Step between windows
          <select id="tl-step" value={step} onChange={(e) => setStep(Number(e.target.value))}>{steps.map((s) => <option key={s} value={s}>{s} s ({Math.round((1 - s / win) * 100)}% overlap)</option>)}</select></label>
        <button className="btn primary" onClick={() => void run()} disabled={busy} aria-busy={busy}>{busy ? <><span className="spinner light" aria-hidden="true" /> Analyzing segments...</> : result ? "Run again" : "Analyze timeline"}</button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {result && (
        <>
          <p className="banner info"><Info size={18} aria-hidden="true" /><span>{result.caution}</span></p>
          <p className="hint mono">{result.segments.length} segments | {result.counts.ok} analyzed | {result.counts.silent} silent | {result.counts.too_short} too short | {result.counts.failed} failed | window {result.window_seconds} s, step {result.step_seconds} s</p>
          <div className="tl-track" style={{ height: `${lanes * 36 + 6}px` }} role="group" aria-label="Segments on a time axis. Select a segment to inspect it.">
            {result.segments.map((s) => (
              <button key={s.index} className={`tl-seg emo-${s.status === "ok" ? s.emotion : "none"} ${sel === s.index ? "sel" : ""}`} aria-pressed={sel === s.index}
                style={{ left: `${(s.start / result.duration) * 100}%`, width: `${((s.end - s.start) / result.duration) * 100}%`, top: `${(s.index % lanes) * 36 + 3}px` }}
                aria-label={`${s.start.toFixed(1)} to ${s.end.toFixed(1)} seconds: ${s.status === "ok" ? label(s.emotion ?? "") : s.status.replace("_", " ")}`}
                onClick={() => setSel(s.index)}>
                <span>{s.status === "ok" ? label(s.emotion ?? "") : s.status.replace("_", " ")}</span>
              </button>
            ))}
          </div>
          <p className="tl-axis mono"><span>0 s</span><span>{(result.duration / 2).toFixed(1)} s</span><span>{result.duration.toFixed(1)} s</span></p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="All segments, scrollable">
            <table className="data">
              <caption className="sr-only">Segment results</caption>
              <thead><tr><th scope="col">Segment</th><th scope="col">Status</th><th scope="col">Closest emotion</th><th scope="col">Top score</th></tr></thead>
              <tbody>{result.segments.map((s) => (
                <tr key={s.index} className={sel === s.index ? "pick-row" : ""}>
                  <th scope="row"><button className="linklike mono" onClick={() => setSel(s.index)}>{s.start.toFixed(1)} to {s.end.toFixed(1)} s</button></th>
                  <td>{s.status.replace("_", " ")}</td><td>{s.emotion ? label(s.emotion) : "none"}</td><td>{s.top_score !== null ? pct(s.top_score) : "none"}</td>
                </tr>))}</tbody>
            </table>
          </div>
          {chosen && (
            <div className="card tl-detail" role="region" aria-label="Selected segment" aria-live="polite">
              <h3>Segment {chosen.start.toFixed(1)} to {chosen.end.toFixed(1)} s</h3>
              {chosen.status === "ok" && chosen.scores ? (
                <>
                  <p>Closest emotion for this window: <b>{label(chosen.emotion ?? "")}</b> (top score {pct(chosen.top_score ?? 0)}). This is an estimate for a short window.</p>
                  <dl className="meta-grid">{Object.entries(chosen.scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd className="mono">{pct(v)}</dd></div>)}</dl>
                </>
              ) : <p>This segment was not classified: {chosen.status === "silent" ? "it is silent or too quiet." : chosen.status === "too_short" ? "it is too short." : "the analysis failed for this window."}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
