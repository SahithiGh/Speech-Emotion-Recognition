import { useEffect, useState } from "react";
import { getInfo, getMetrics, type Metrics, type ModelInfo } from "../api";
import { usePageMeta } from "../meta";
import ErrorText from "../components/ErrorText";
import { dateText, label, pct } from "../format";

import PageHero from "../components/PageHero";

const NA = "unavailable";

export default function ModelInfoPage() {
  usePageMeta("Model information", "Dataset, license, architecture, preprocessing, feature importance, limitations and reproduction steps for the speech emotion model.", "/model");
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getInfo().then(setInfo).catch((e: Error) => setError(e.message)); getMetrics().then(setM).catch(() => undefined); }, []);

  if (error) return <section className="wrap section"><h1>Model information</h1><ErrorText>{error}</ErrorText></section>;
  if (!info) return <section className="wrap section"><h1>Model information</h1><p role="status"><span className="spinner" aria-hidden="true" /> Loading...</p></section>;
  const rows: [string, React.ReactNode][] = [
    ["Active Production Model", <strong key="model_name" style={{ color: "var(--color-primary-text)" }}>{info.model_name || "emotion2vec+ (Base) + Logistic Regression (C=0.05)"}</strong>],
    ["Model status", info.status === "ready" ? "Ready" : info.status === "incompatible" ? "Saved model is incompatible with this software" : "Model not trained yet"],
    ["Evaluation status", info.evaluation_status === "evaluated" ? "Evaluated on held-out speakers" : "Evaluation pending"],
    ["Feature Representation", info.preprocessing ? `${info.preprocessing.n_features} dimensions (${info.preprocessing.feature_version || "self-supervised embeddings"})` : "768 dimensions"],
    ["Language", info.languages.map((l) => `${l.name} (${l.dataset})`).join(", ")],
    ["Emotion classes", info.emotions.map(label).join(", ")],
    ["Architecture", info.architecture ?? NA],
    ["Sample rate and input", info.sample_rate ? `${info.sample_rate} Hz. ${info.expected_input}` : NA],
    ["Model ID", info.model_id ? <code>{info.model_id}</code> : NA],
    ["Trained at", info.trained_at ? dateText(info.trained_at) : NA],
  ];
  const fi = m?.trained ? m.feature_importance : undefined;
  return (
    <>
      <PageHero
        kicker="Architecture & Lineage"
        title="Model Information & Architecture"
        description="Transparent overview of acoustic feature pipelines, 768-D self-supervised embeddings, classifier specifications, CREMA-D dataset licensing, and responsible AI disclosures."
        videoSrc="/media/orbit-network.mp4"
        webmSrc="/media/orbit-network.webm"
        posterSrc="/media/orbit-network-poster.webp"
      />

      <section className="wrap section prose" style={{ paddingTop: "0.5rem" }}>
        <div className="model-info-workspace-card">
          <dl className="facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>

      <h2>Dataset and permitted use</h2>
      <p>{info.dataset.name}. {info.dataset.nature}. License: {info.dataset.license}. Source: <a href={info.dataset.source} rel="noopener noreferrer">{info.dataset.source}</a>. The audio is not redistributed with this project; follow the dataset's license and citation requirements.</p>
      <p className="small muted">{info.dataset.citation}</p>

      <h2>Pipeline</h2>
      <ol>
        <li><b>Preprocessing</b> (same code for training and prediction): mono, 16 kHz, silence trimmed, first 6 seconds kept, peak-normalized. Clips under 0.5 s or near-silent are rejected; clipping and very short clips produce warnings.</li>
        <li><b>Features</b>: {info.preprocessing ? `${info.preprocessing.n_features} values per clip (${info.preprocessing.feature_version || "emotion2vec+ representation"}).` : "768 values per clip (self-supervised emotion2vec+ embeddings)."}</li>
        <li><b>Model</b>: standardization fitted on training data only, then the selected classifier (see Architecture above). Candidates were compared by speaker-grouped cross-validation on development speakers; test speakers were never used to choose.</li>
        <li><b>Evaluation</b>: accuracy, macro precision, recall and F1, unweighted average recall (the mean of the six per-emotion recalls), per-emotion scores and the confusion matrix on held-out speakers. See the Evaluation page.</li>
        <li><b>Profile Rollback Support</b>: In addition to the default production model, the platform preserves Option 2 Staging and baseline SVM Rollback profiles accessible via runtime configuration.</li>
      </ol>

      <h2>Which sound properties the model relies on</h2>
      {fi ? (
        <>
          <p className="small">{fi.method}.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Feature group importance, scrollable">
            <table className="data">
              <thead><tr><th scope="col">Sound property</th><th scope="col">Drop in macro F1 when shuffled</th><th scope="col">Values</th><th scope="col">What it describes</th></tr></thead>
              <tbody>{fi.groups.map((g) => <tr key={g.key}><th scope="row">{g.label}</th><td>{pct(g.importance_mean, 1)} +/- {pct(g.importance_std, 1)}</td><td>{g.n_features}</td><td style={{ whiteSpace: "normal", fontFamily: "var(--font-body)" }}>{g.description}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="muted small">{fi.caveat}</p>
        </>
      ) : <p className="card empty">Not available yet. This table is computed during training from validation speakers, so it appears after a real training run. No per-prediction explanation is offered, because none has been validated.</p>}

      <h2>Intended use and limitations</h2>
      <ul>{info.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      <p>Intended for learning, research demonstrations and exploration of vocal patterns. Not for employment, education, medical or other consequential decisions about people.</p>

      <h2>Cross-Modal Consistency & Words vs Vocal Tone</h2>
      <p>
        The application provides dual-modality evaluation by comparing acoustic vocal features against the lexical phrasing transcribed by the local speech-to-text engine:
      </p>
      <ul>
        <li><b>Vocal Emotion</b>: Evaluated exclusively from raw acoustic dynamics (pitch contours, spectral centroids, MFCCs, energy distributions).</li>
        <li><b>Wording Affect</b>: Evaluated from the transcript text using a lexical sentiment and affect analyzer with negation detection.</li>
        <li><b>Cross-Modal Consistency</b>: Compares whether vocal delivery and literal wording agree (Broadly Consistent, May Differ, or Insufficient Evidence).</li>
          <li><b>Ethical Notice</b>: Divergence between vocal tone and literal wording is a natural facet of human conversation (e.g., understatement, formal restraint, or subtle irony). It is never evidence of deception, lying, or verified psychological states.</li>
        </ul>
      </div>
    </section>
    </>
  );
}
