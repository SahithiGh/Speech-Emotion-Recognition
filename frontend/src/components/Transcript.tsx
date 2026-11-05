import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { getTranscript, getTranscriptionStatus, type Transcript as T, type TranscriptionStatus } from "../api";
import { withUpload, type Source } from "../types";
import ErrorText from "./ErrorText";

export default function Transcript({ source, result, onResult }: { source: Source; result: T | null; onResult: (t: T | null) => void }) {
  const [st, setSt] = useState<TranscriptionStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getTranscriptionStatus().then(setSt).catch(() => setOffline(true)); }, []);

  const run = async () => {
    setBusy(true); setError(null); onResult(null);
    try { onResult(await withUpload(source, getTranscript)); }
    catch (e) { setError(e instanceof Error ? e.message : "Transcription failed."); }
    finally { setBusy(false); }
  };
  if (offline) return <ErrorText>The backend is not running, so transcription status is unknown.</ErrorText>;
  if (!st) return <p role="status"><span className="spinner" aria-hidden="true" /> Checking transcription...</p>;
  if (!st.available) return <p className="banner warn"><AlertTriangle size={18} aria-hidden="true" /><span>Transcription is unavailable. {st.reason} Emotion analysis works without it, and no transcript is ever generated unless a real speech-to-text engine is configured.</span></p>;
  return (
    <div>
      <p className="hint">Engine: {st.label}. English only. The transcript is separate from the emotion prediction, and its accuracy has not been evaluated in this project.</p>
      <p className="banner info"><Info size={18} aria-hidden="true" /><span>{st.privacy}</span></p>
      <div className="field check">
        <input id="tr-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <label htmlFor="tr-consent">I agree to transcribe this audio on this computer with {st.label}.</label>
      </div>
      <button className="btn primary" onClick={() => void run()} disabled={!consent || busy} aria-busy={busy}>{busy ? <><span className="spinner light" aria-hidden="true" /> Transcribing...</> : "Transcribe speech"}</button>
      {error && <ErrorText>{error}</ErrorText>}
      {result && (
        <div className="card" role="region" aria-label="Transcript" aria-live="polite">
          {result.no_speech ? <p>No speech was recognized in this audio.</p> : <p className="transcript">{result.text}</p>}
          <p className="hint">{result.note}</p>
        </div>
      )}
    </div>
  );
}
