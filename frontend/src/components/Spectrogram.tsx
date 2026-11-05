import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSpectrogram, type SpectrogramResult } from "../api";
import { withUpload, type Source } from "../types";
import ErrorText from "./ErrorText";

const W = 960, H = 280;
const hex = (v: string): [number, number, number] => { const h = v.trim().replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };

/** 256-step colour ramp built from the active theme's tokens, so the heat map follows light and dark mode. */
function buildLut(): Uint8ClampedArray {
  const cs = getComputedStyle(document.documentElement);
  const stops = ["--color-surface-muted", "--color-chart-bar", "--color-chart-bar-top", "--color-foreground"].map((n) => hex(cs.getPropertyValue(n)));
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const p = (i / 255) * (stops.length - 1), k = Math.min(Math.floor(p), stops.length - 2), f = p - k;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
  }
  return lut;
}
const niceStep = (span: number) => { const raw = span / 6; const pow = 10 ** Math.floor(Math.log10(raw)); const m = raw / pow; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * pow; };

export default function Spectrogram({ source }: { source: Source }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [spec, setSpec] = useState<SpectrogramResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[number, number]>([0, source.buffer.duration]);
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const q = useMemo(() => (spec ? Uint8Array.from(atob(spec.data), (c) => c.charCodeAt(0)) : null), [spec]);

  const load = useCallback(() => {
    setPhase("loading"); setError(null);
    withUpload(source, getSpectrogram).then((s) => { setSpec(s); setRange([0, s.duration]); setPhase("ready"); })
      .catch((e: Error) => { setError(e.message); setPhase("error"); });
  }, [source]);
  useEffect(load, [load]);

  useEffect(() => {   // repaint when the theme changes
    const obs = new MutationObserver(() => setTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !spec || !q) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const lut = buildLut(), img = ctx.createImageData(W, H);
    const [t0, t1] = range;
    for (let x = 0; x < W; x++) {
      const t = t0 + ((x + 0.5) / W) * (t1 - t0);
      const f = Math.min(spec.frames - 1, Math.max(0, Math.round((t - spec.first_frame_center_seconds) / spec.frame_seconds)));
      for (let y = 0; y < H; y++) {
        const m = Math.min(spec.n_mels - 1, Math.floor(((H - 1 - y) / H) * spec.n_mels));
        const v = q[m * spec.frames + f], o = (y * W + x) * 4;
        img.data[o] = lut[v * 3]; img.data[o + 1] = lut[v * 3 + 1]; img.data[o + 2] = lut[v * 3 + 2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [spec, q, range, tick]);

  if (phase === "loading") return <p role="status"><span className="spinner" aria-hidden="true" /> Computing the spectrogram from your audio...</p>;
  if (phase === "error" || !spec || !q) return <div><ErrorText>{error ?? "The spectrogram could not be created."}</ErrorText><button className="btn" onClick={load}>Try again</button></div>;

  const [t0, t1] = range, span = t1 - t0, step = niceStep(span);
  const xTicks: number[] = []; for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) xTicks.push(Number(t.toFixed(3)));
  const yTicks = [0, 1000, 2000, 4000, 8000].map((hz) => { const m = spec.mel_frequencies_hz.reduce((b, f, i) => (Math.abs(f - hz) < Math.abs(spec.mel_frequencies_hz[b] - hz) ? i : b), 0); return { hz, pos: (1 - (m + 0.5) / spec.n_mels) * 100 }; });
  const rowMean = Array.from({ length: spec.n_mels }, (_, m) => { let s = 0; for (let f = 0; f < spec.frames; f++) s += q[m * spec.frames + f]; return s / spec.frames; });
  const top = rowMean.indexOf(Math.max(...rowMean));
  const active: number[] = []; for (let f = 0; f < spec.frames; f++) { let mx = 0; for (let m = 0; m < spec.n_mels; m++) mx = Math.max(mx, q[m * spec.frames + f]); if (mx > 0.7 * 255) active.push(spec.first_frame_center_seconds + f * spec.frame_seconds); }
  const summary = `Strongest average energy is near ${(spec.mel_frequencies_hz[top] / 1000).toFixed(1)} kHz. ` +
    (active.length ? `Sound within 22 dB of the loudest point appears between ${Math.min(...active).toFixed(1)} s and ${Math.max(...active).toFixed(1)} s.` : "No clearly dominant sound was found.");

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const t = t0 + fx * span, m = Math.min(spec.n_mels - 1, Math.floor((1 - fy) * spec.n_mels));
    const f = Math.min(spec.frames - 1, Math.max(0, Math.round((t - spec.first_frame_center_seconds) / spec.frame_seconds)));
    const db = spec.db_min + (q[m * spec.frames + f] / 255) * (spec.db_max - spec.db_min);
    setHover(`${t.toFixed(2)} s, about ${(spec.mel_frequencies_hz[m] / 1000).toFixed(2)} kHz, ${db.toFixed(0)} dB`);
  };
  const setStart = (v: number) => setRange([Math.min(v, t1 - 0.5), t1]);
  const setEnd = (v: number) => setRange([t0, Math.max(v, t0 + 0.5)]);

  return (
    <div className="spec">
      <p className="hint">This view shows which frequencies are present in your audio over time. It is a visualization of the sound, not an emotion prediction.</p>
      <div className="spec-plot">
        <div className="spec-y" aria-hidden="true">{yTicks.map((t) => <span key={t.hz} style={{ bottom: `${t.pos}%` }}>{t.hz === 0 ? "0" : t.hz / 1000} kHz</span>)}</div>
        <canvas ref={canvas} width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
          aria-label={`Spectrogram of your audio from ${t0.toFixed(1)} to ${t1.toFixed(1)} seconds, frequency 0 to 8 kilohertz. ${summary}`} />
        <div className="spec-x" aria-hidden="true">{xTicks.map((t) => <span key={t} style={{ left: `${((t - t0) / span) * 100}%` }}>{t}</span>)}</div>
      </div>
      <p className="spec-axis mono"><span>Time (seconds)</span><span>Vertical axis: frequency in kHz, mel scale</span></p>
      <p className="hint mono" aria-live="polite">{hover ?? "Move the pointer over the plot to read time, frequency and level."}</p>
      <div className="legend"><span className="mono">{spec.db_min} dB</span><span className="legend-bar" aria-hidden="true" /><span className="mono">{spec.db_max} dB</span></div>
      <p className="hint">Colour shows level relative to the loudest point of this clip (0 dB). Darker or brighter does not mean a stronger emotion.</p>
      <p>{summary}</p>
      <div className="range-row">
        <label>Start <span className="mono">{t0.toFixed(1)} s</span><input type="range" min={0} max={spec.duration} step={0.1} value={t0} onChange={(e) => setStart(Number(e.target.value))} /></label>
        <label>End <span className="mono">{t1.toFixed(1)} s</span><input type="range" min={0} max={spec.duration} step={0.1} value={t1} onChange={(e) => setEnd(Number(e.target.value))} /></label>
        <button className="btn" onClick={() => setRange([0, spec.duration])} disabled={t0 === 0 && t1 === spec.duration}>Show whole clip</button>
      </div>
    </div>
  );
}
