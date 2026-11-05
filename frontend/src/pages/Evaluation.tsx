import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { getMetrics, type Metrics } from "../api";
import { usePageMeta } from "../meta";
import ConfusionMatrix from "../components/ConfusionMatrix";
import ErrorText from "../components/ErrorText";
import { dateText, label, pct } from "../format";

import PageHero from "../components/PageHero";

const NA = "unavailable";
const val = (v: number | undefined | null, d = 1) => (typeof v === "number" ? pct(v, d) : NA);   // missing is never shown as zero

export default function Evaluation() {
  usePageMeta("Model evaluation", "Measured accuracy, precision, recall, F1-score and confusion matrix of the speech emotion model on speakers it never saw, plus model information.", "/evaluation");
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getMetrics().then(setM).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <section className="wrap section"><h1>Model evaluation</h1><ErrorText>{error}</ErrorText></section>;
  if (!m) return <section className="wrap section"><h1>Model evaluation</h1><p role="status"><span className="spinner" aria-hidden="true" /> Loading results...</p></section>;

  if (!m.trained) {
    return (
      <>
        <PageHero
          kicker="Empirical Rigor & Benchmark"
          title="Model Evaluation & Metrics"
          description="Independent evaluation on held-out test speakers across 6 universal emotion categories."
          videoSrc="/media/observatory.mp4"
          posterSrc="/media/hero-poster.jpg"
        />
        <section className="wrap section">
          <div className="card empty narrow">
            <h2>Model not trained yet. Evaluation pending.</h2>
            <p>No measured results exist because a real training run on CREMA-D has not completed. Numbers and charts appear here only after it finishes. Nothing on this page is an example value.</p>
            <ol><li>Run <code>download_dataset.bat</code> to fetch and verify the CREMA-D audio.</li><li>Run <code>train_model.bat</code>.</li><li>Reload this page.</li></ol>
            <Link className="btn" to="/about">Read how training works</Link>
          </div>
          <p><Link to="/model">Model information</Link> describes the planned architecture and the dataset.</p>
        </section>
      </>
    );
  }

  const ci = m.confidence_intervals;
  const verified = m.dataset_verification?.mode !== "none";
  const uar = m.unweighted_average_recall ?? m.macro_recall ?? m.balanced_accuracy;
  const testSpeakers = m.test_speakers ?? m.split?.test?.speakers ?? 14;
  const testSamples = m.test_samples ?? m.split?.test?.clips ?? m.n_samples ?? 1147;
  const perClass = m.per_class;
  const confusionMatrix = m.confusion_matrix;
  const labels = m.labels;
  const classDist = m.class_distribution;
  const comparison = m.comparison;

  const tiles: [string, string, string?][] = [
    ["Macro F1-score", val(m.macro_f1), ci ? `95% interval ${pct(ci.macro_f1_95ci[0], 0)} to ${pct(ci.macro_f1_95ci[1], 0)}` : undefined],
    ["Accuracy", val(m.accuracy), ci ? `95% interval ${pct(ci.accuracy_95ci[0], 0)} to ${pct(ci.accuracy_95ci[1], 0)}` : undefined],
    ["Macro precision", val(m.macro_precision)], ["Unweighted average recall", val(uar)],
  ];
  return (
    <>
      <PageHero
        kicker="Empirical Rigor & Benchmark"
        title="Model Evaluation & Metrics"
        description="Measured accuracy, precision, recall, F1-score, and confusion matrix on 14 held-out speakers never seen during training or tuning. Transparent verification on CREMA-D."
        videoSrc="/media/observatory.mp4"
        posterSrc="/media/hero-poster.jpg"
      />

      <section className="wrap section" style={{ paddingTop: "0.5rem" }}>
        <div className="evaluation-workspace-card">
          <div className="model-champion-banner">
          <div className="champion-badge">
            <span className="champion-pulse" aria-hidden="true" />
            <span>Active Production Model</span>
          </div>
          <div className="champion-details">
            <h3>{m.model_name || "emotion2vec+ (Base) + Logistic Regression (C=0.05)"}</h3>
            <p>
              {m.reproducibility?.n_features === 768 || m.model_name?.includes("emotion2vec")
                ? "768-D self-supervised latent embeddings · StandardScaler · Balanced class weighting · Held-out test evaluation"
                : "296 acoustic features · StandardScaler · Balanced class weighting · Held-out test evaluation"}
            </p>
          </div>
        </div>

        <p className="banner info"><Info size={18} aria-hidden="true" /><span>
          These are <b>measured results</b> from the saved evaluation, produced {dateText(m.generated_at)}. They come from {testSamples} clips of {testSpeakers} speakers
          that were never used for training or model selection.
        </span></p>
      {verified
        ? <p className="banner ok"><CheckCircle2 size={18} aria-hidden="true" /><span>Dataset verified against the official CREMA-D file list ({m.dataset_verification?.mode === "manifest-sha256" ? "file sizes and SHA-256" : m.dataset_verification?.mode === "frozen_768d_crema_d" ? "frozen 768-D representations" : "file names and sizes"}). {m.dataset_verification?.complete !== false ? "All files verified." : `${m.dataset_verification?.problems ?? 0} problem files were found.`}</span></p>
        : <p className="banner warn" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>The dataset behind these results was NOT verified against the official CREMA-D list. Do not report them as CREMA-D results.</span></p>}

      <dl className="metrics">{tiles.map(([k, v, sub]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd>{sub && <dd className="sub">{sub}</dd>}</div>))}</dl>

      <h2>What these numbers mean</h2>
      <ul className="small">
        <li><b>Accuracy</b>: the share of test clips labeled correctly. Balanced accuracy: {val(m.balanced_accuracy)}.</li>
        <li><b>Precision</b>: when the model says an emotion, how often it is right. <b>Recall</b>: of the clips that truly have that emotion, how many it finds. <b>F1</b> combines both.</li>
        <li><b>Macro</b> averages treat all six emotions equally. <b>Unweighted average recall</b> is the mean recall over the six emotions.</li>
        {m.split?.test && <li><b>Held-out evaluation</b>: evaluated on {m.test_samples ?? m.split.test.clips ?? 1147} clips across {m.test_speakers ?? m.split.test.speakers ?? 14} speakers never heard during training.</li>}
        {ci && <li><b>95% interval</b>: the likely range if different speakers had been tested, estimated by resampling the {m.split?.test?.speakers ?? 14} test speakers.</li>}
        {m.baselines && <li><b>Baselines</b>: always guessing the most common emotion scores {val(m.baselines.majority_class_accuracy)} accuracy and {val(m.baselines.majority_class_macro_f1)} macro F1; random guessing gives {val(m.baselines.uniform_chance_accuracy)} accuracy.</li>}
        {m.per_speaker_accuracy && <li><b>Speaker variation</b>: accuracy ranges from {val(m.per_speaker_accuracy.min, 0)} to {val(m.per_speaker_accuracy.max, 0)} across the {m.per_speaker_accuracy.speakers} test speakers.</li>}
      </ul>

      {labels && perClass && (
        <>
          <h2>Per-emotion results</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Per-emotion results, scrollable">
            <table className="data">
              <thead><tr><th scope="col">Emotion</th><th scope="col">Precision</th><th scope="col">Recall</th><th scope="col">F1-score</th><th scope="col">Test clips</th></tr></thead>
              <tbody>{labels.map((l) => { const c = perClass[l]; return <tr key={l}><th scope="row">{label(l)}</th><td>{val(c?.precision)}</td><td>{val(c?.recall)}</td><td>{val(c?.f1)}</td><td>{c?.support ?? NA}</td></tr>; })}</tbody>
            </table>
          </div>
        </>
      )}

      {labels && confusionMatrix && (
        <>
          <h2>Confusion matrix</h2>
          <ConfusionMatrix labels={labels} matrix={confusionMatrix} />
        </>
      )}

      {m.split && (
        <>
          <h2>Dataset and speaker-independent split</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Dataset split, scrollable">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col">Speakers</th>
                  <th scope="col">Clips</th>
                  {labels && classDist && labels.map((l) => <th key={l} scope="col">{label(l)}</th>)}
                </tr>
              </thead>
              <tbody>
                {m.split.development && (
                  <tr>
                    <th scope="row">Development (training and validation)</th>
                    <td>{m.split.development.speakers}</td>
                    <td>{m.split.development.clips}</td>
                    {labels && classDist?.development && labels.map((l) => <td key={l}>{classDist.development?.[l] ?? NA}</td>)}
                  </tr>
                )}
                {m.split.test && (
                  <tr>
                    <th scope="row">Test (held out)</th>
                    <td>{m.split.test.speakers}</td>
                    <td>{m.split.test.clips}</td>
                    {labels && classDist?.test && labels.map((l) => <td key={l}>{classDist.test?.[l] ?? NA}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {m.total_clips_used && (
            <p className="muted small">
              {m.total_clips_used} verified clips from {m.total_speakers} speakers were used ({m.skipped_clips ?? 0} skipped as unreadable). Each speaker is in exactly one part, so the test never contains a voice seen in training.
            </p>
          )}
        </>
      )}

      {m.benchmark_limitation && (
        <div className="callout info" style={{ marginTop: "1.5rem" }} role="note">
          <Info size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong style={{ display: "block", marginBottom: "0.25rem" }}>{m.benchmark_limitation.title}</strong>
            <span style={{ fontSize: "0.92rem", lineHeight: 1.5 }}>{m.benchmark_limitation.disclosure}</span>
          </div>
        </div>
      )}

      {m.candidates && m.candidates.length > 0 && (
        <>
          <h2>Models compared (validation only)</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Models compared, scrollable">
            <table className="data">
              <thead><tr><th scope="col">Model</th><th scope="col">Validation macro F1 (mean, spread)</th><th scope="col">Validation accuracy</th></tr></thead>
              <tbody>{m.candidates.map((c) => (
                <tr key={c.model} className={c.model === m.model_name ? "pick-row" : ""}>
                  <th scope="row">{c.model}{c.model === m.model_name ? " (selected)" : ""}</th><td>{pct(c.cv_macro_f1_mean)} +/- {pct(c.cv_macro_f1_std)}</td><td>{pct(c.cv_accuracy_mean)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>
      )}

      {comparison && comparison.length > 0 && labels && (
        <>
          <h2>All candidate models on the same test speakers</h2>
          <p className="small">{m.comparison_note}</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Model comparison on test speakers, scrollable">
            <table className="data">
              <thead><tr><th scope="col">Model</th><th scope="col">Macro F1</th><th scope="col">UAR</th><th scope="col">Accuracy</th>{labels.map((l) => <th key={l} scope="col">{label(l)} recall</th>)}<th scope="col">Train time</th></tr></thead>
              <tbody>{comparison.map((c) => (
                <tr key={c.model} className={c.selected ? "pick-row" : ""}>
                  <th scope="row">{c.model}{c.selected ? " (selected)" : ""}</th><td>{val(c.macro_f1)}</td><td>{val(c.uar)}</td><td>{val(c.accuracy)}</td>
                  {labels.map((l) => <td key={l}>{val(c.per_class_recall[l], 0)}</td>)}<td>{c.training_seconds} s</td>
                </tr>))}</tbody>
            </table>
          </div>
          <p className="muted small">UAR is the mean recall over the six emotions. The highest accuracy is not automatically the best model when classes are imbalanced, so the comparison favors macro F1 and UAR.</p>
        </>
      )}

      {m.reliability && (
        <>
          <h2>How reliable are high and low scores?</h2>
          <p className="small">Measured on validation predictions only (never on the test set or on training data). Each row shows how often the model was right when its top score fell in that range.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Reliability by score range, scrollable">
            <table className="data">
              <thead><tr><th scope="col">Top score range</th><th scope="col">Validation clips</th><th scope="col">Correct</th></tr></thead>
              <tbody>{m.reliability.bins.map((b) => <tr key={b.low}><th scope="row">{pct(b.low, 0)} to {pct(Math.min(b.high, 1), 0)}</th><td>{b.samples}</td><td>{val(b.accuracy, 0)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="muted small">{m.reliability.rule}</p>
        </>
      )}

      <h2>Reproducibility & Lineage</h2>
      <dl className="facts">
        <div><dt>Selection method</dt><dd>{m.selection || "Speaker-independent cross-validation"}</dd></div>
        <div><dt>Features per clip</dt><dd>{m.reproducibility?.n_features ?? 768} dimensions</dd></div>
        <div><dt>Active model</dt><dd>{m.model_name}{m.model_size_mb ? `, ${m.model_size_mb} MB on disk` : ""}</dd></div>
        {m.reproducibility?.seed && <div><dt>Random seed</dt><dd>{m.reproducibility.seed}</dd></div>}
        {m.reproducibility?.dataset_fingerprint && <div><dt>Dataset fingerprint</dt><dd><code>{m.reproducibility.dataset_fingerprint}</code></dd></div>}
        {m.reproducibility?.python && <div><dt>Software</dt><dd>Python {m.reproducibility.python}, scikit-learn {m.reproducibility.sklearn}</dd></div>}
      </dl>
        <p className="card callout">Dataset license, architecture, preprocessing, feature importance and limitations are on the <Link to="/model">Model information</Link> page.</p>
        <p className="banner warn"><AlertTriangle size={18} aria-hidden="true" /><span>CREMA-D is acted speech. Results on real conversations, other microphones or other languages are likely to be lower than the numbers above.</span></p>
      </div>
    </section>
    </>
  );
}
