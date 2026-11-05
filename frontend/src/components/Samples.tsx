import { useEffect, useState } from "react";
import { getSamples, type SampleItem } from "../api";

/** Optional example recordings. The list comes from public/samples/manifest.json; nothing is shown as a sample unless it is listed there with its source and license. */
export default function Samples({ onLoad, disabled }: { onLoad: (blob: Blob, title: string) => void; disabled: boolean }) {
  const [items, setItems] = useState<SampleItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { getSamples().then(setItems).catch(() => setItems([])); }, []);
  const use = async (s: SampleItem) => {
    setBusy(s.id); setError(null);
    try {
      const res = await fetch(`/samples/${encodeURIComponent(s.file)}`);
      if (!res.ok) throw new Error();
      onLoad(await res.blob(), s.title);
    } catch { setError(`The sample "${s.title}" could not be loaded.`); }
    finally { setBusy(null); }
  };
  return (
    <details className="samples">
      <summary>Example recordings</summary>
      {items === null && <p role="status">Checking for examples...</p>}
      {items?.length === 0 && <p className="hint">No example recordings are installed. They are optional and are only listed when their source and license are documented (see the README, section on example recordings).</p>}
      {items && items.length > 0 && (
        <ul className="sample-list">
          {items.map((s) => (
            <li key={s.id} className="card">
              <h3>{s.title} <span className="hint">(example)</span></h3>
              <p className="small">{s.description}</p>
              <p className="hint">Source: {s.source}. License: {s.license}. Examples show how the app works; they are not evidence of model accuracy and may not be classified correctly.</p>
              <audio controls src={`/samples/${encodeURIComponent(s.file)}`} preload="none" aria-label={`Play example: ${s.title}`} />
              <button className="btn" onClick={() => void use(s)} disabled={disabled || busy !== null}>{busy === s.id ? "Loading..." : "Use this example"}</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </details>
  );
}
