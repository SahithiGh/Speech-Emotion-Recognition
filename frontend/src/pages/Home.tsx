import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Mic,
  Upload,
  AudioWaveform,
  BarChart3,
  SlidersHorizontal,
  ArrowRight,
  Info,
} from "lucide-react";
import { EMOTIONS, getMetrics, type Metrics } from "../api";
import { useModel } from "../model";
import { usePageMeta } from "../meta";
import HeroVideo from "../components/HeroVideo";
import { label, pct } from "../format";

const STEPS = [
  {
    icon: Mic,
    num: "01",
    title: "Provide Audio",
    desc: "Record live via microphone or upload standard audio/video files (WAV, MP3, OGG, FLAC, M4A, MP4, WebM).",
  },
  {
    icon: AudioWaveform,
    num: "02",
    title: "Standardize & Normalize",
    desc: "Trims silence, standardizes to 16 kHz mono, and normalizes acoustic amplitudes for consistent signal conditioning.",
  },
  {
    icon: SlidersHorizontal,
    num: "03",
    title: "Extract 768-D Embeddings",
    desc: "Computes self-supervised latent speech representations capturing vocal timbre, prosody, cadence, and harmonics.",
  },
  {
    icon: BarChart3,
    num: "04",
    title: "Classify Six Emotions",
    desc: "Calculates calibrated multi-class probability scores across the six universal categories with acoustic confidence margins.",
  },
];

const EMOTION_DETAILS: Record<string, { desc: string; acousticCue: string; tag: string }> = {
  happy: {
    desc: "Bright, lively cadence characterized by expansive pitch variation and warm harmonic resonance.",
    acousticCue: "Elevated mean F0, dynamic pitch contours, bright spectral energy",
    tag: "Expansive",
  },
  sad: {
    desc: "Subdued, quiet delivery characterized by lowered mean pitch, reduced amplitude, and extended pauses.",
    acousticCue: "Reduced RMS amplitude, narrowed pitch bandwidth, low speech ratio",
    tag: "Attenuated",
  },
  angry: {
    desc: "Forceful, loud vocalization with elevated spectral energy and sharp acoustic attacks.",
    acousticCue: "High RMS energy, expanded pitch ceiling, elevated spectral tilt",
    tag: "High Energy",
  },
  fear: {
    desc: "Hurried, unsteady speech exhibiting pitch instability, jitter, and elevated pitch baseline.",
    acousticCue: "Acoustic tremor, rapid syllable cadence, heightened pitch variation",
    tag: "Tense",
  },
  disgust: {
    desc: "Drawn-out phonation with vocal fry, lowered tempo, and distinctive downward spectral glide.",
    acousticCue: "Strained vocal tract resonance, low pitch rate, prolonged vowels",
    tag: "Strained",
  },
  neutral: {
    desc: "Steady, measured delivery with restrained pitch excursion and even energy distribution.",
    acousticCue: "Stable F0 fundamental, baseline zero-crossing rate, moderate energy",
    tag: "Baseline",
  },
};

export default function Home() {
  usePageMeta(
    "Home",
    "Speech Emotion Recognition. Machine learning research platform trained on the CREMA-D dataset across six universal emotion categories.",
    "/"
  );

  const model = useModel();
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    if (model.phase === "ready" && model.status.trained) {
      getMetrics()
        .then((m) => m.trained && setMetrics(m))
        .catch(() => undefined);
    }
  }, [model]);

  const modelStatus = model.phase === "ready" ? model.status : null;
  const activeModelName =
    metrics?.model_name ||
    modelStatus?.model_name ||
    "emotion2vec+ (Base) + Logistic Regression (C=0.05)";

  const isE2V =
    activeModelName.toLowerCase().includes("emotion2vec") ||
    (modelStatus?.profile?.toLowerCase().includes("emotion2vec") ?? false) ||
    (modelStatus?.profile?.toLowerCase().includes("production") ?? false);

  return (
    <>
      {/* ===== HERO SECTION ===== */}
      <section className="hero-video" aria-label="Introduction">
        <HeroVideo />
        <div className="wrap hero-inner">
          <div>
            <p className="hero-label">Acoustic Machine Learning Research</p>
            <h1 className="hero-title">
              <span className="hl hl-1">Speech</span>{" "}
              <span className="hl hl-2">Emotion</span>{" "}
              <span className="hl hl-3">Recognition</span>
            </h1>
          </div>
          <div className="hero-foot">
            <div className="hero-cta">
              <p className="hero-lead">
                Analyze how voices sound across six universal emotion categories. Evaluated on CREMA-D with 768-dimensional self-supervised speech representations.
              </p>
              <div className="hero-actions">
                <Link className="btn hero-btn solid" to="/analyze?mode=upload">
                  <Upload size={18} aria-hidden="true" />
                  <span>Analyze Audio</span>
                </Link>
                <Link className="btn hero-btn" to="/analyze?mode=record">
                  <Mic size={18} aria-hidden="true" />
                  <span>Live Recording</span>
                </Link>
              </div>
            </div>
            <p className="hero-meta" role="status">
              {model.phase === "loading" && "Checking model..."}
              {model.phase === "offline" && "Backend offline"}
              {model.phase === "ready" && !model.status.trained && (
                model.status.state === "incompatible"
                  ? "Saved model incompatible. Train again."
                  : "Model not trained yet"
              )}
              {model.phase === "ready" && model.status.trained && (
                metrics
                  ? `${activeModelName} | Macro F1 ${pct(metrics.macro_f1)} on ${metrics.split?.test?.speakers ?? 14} unseen speakers`
                  : `Model ready: ${activeModelName}`
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ===== SECTION 1: THE SIX UNIVERSAL EMOTIONS (CENTERPIECE) ===== */}
      <section className="wrap section home-section">
        <div className="home-section-header">
          <p className="eyebrow">Acoustic Profiles</p>
          <h2>The Six Universal Emotions</h2>
          <p className="lead">
            Acoustic characteristics observed in acted speech across the CREMA-D dataset. Each card reflects its distinct emotion classification profile.
          </p>
        </div>
        <div className="home-emotions-grid">
          {EMOTIONS.map((emo) => {
            const info = EMOTION_DETAILS[emo];
            return (
              <div key={emo} className={`home-emotion-card emo-${emo}`}>
                <div className="emo-card-header">
                  <h3 className="emo-title">{label(emo)}</h3>
                  <span className="emo-tag">{info.tag}</span>
                </div>
                <p className="emo-desc">{info.desc}</p>
                <div className="emo-cues">
                  <span className="cue-label">Acoustic Indicators:</span>
                  <p className="cue-text">{info.acousticCue}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== SECTION 2: ARCHITECTURAL PIPELINE ===== */}
      <section className="wrap section home-section">
        <div className="home-section-header">
          <p className="eyebrow">Processing Architecture</p>
          <h2>How the System Analyzes Speech</h2>
          <p className="lead">
            From raw waveform ingestion to calibrated emotion classification in four deliberate stages.
          </p>
        </div>
        <ol className="home-steps-grid">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="home-step-card">
                <div className="step-card-top">
                  <span className="step-badge">{step.num}</span>
                  <div className="step-icon-wrap">
                    <Icon size={20} aria-hidden="true" />
                  </div>
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ===== SECTION 3: EMPIRICAL VERIFICATION BANNER ===== */}
      <section className="wrap section home-section">
        <div className="home-model-banner">
          <div className="model-banner-content">
            <p className="eyebrow">Empirical Verification</p>
            <h2>Production Model: {activeModelName}</h2>
            <p>
              Evaluated on {metrics?.test_samples ?? 1147} recordings from {metrics?.split?.test?.speakers ?? 14} held-out CREMA-D speakers who were never heard during training or hyperparameter tuning.
            </p>
            <div className="model-metrics-row">
              <div className="metric-cell">
                <span className="metric-val">{metrics ? pct(metrics.accuracy) : "67.4%"}</span>
                <span className="metric-lbl">Test Accuracy</span>
              </div>
              <div className="metric-cell">
                <span className="metric-val">{metrics ? pct(metrics.macro_f1) : "66.5%"}</span>
                <span className="metric-lbl">Macro F1-Score</span>
              </div>
              <div className="metric-cell">
                <span className="metric-val">{metrics ? pct(metrics.balanced_accuracy) : "66.8%"}</span>
                <span className="metric-lbl">Balanced Accuracy</span>
              </div>
              <div className="metric-cell">
                <span className="metric-val">{isE2V ? "768-D" : "296"}</span>
                <span className="metric-lbl">Feature Dimension</span>
              </div>
            </div>
            <div className="banner-actions">
              <Link className="btn primary" to="/evaluation">
                <span>View Full Evaluation Dashboard</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="btn sub" to="/model">
                <span>Model Specifications</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: RESPONSIBLE MACHINE LEARNING CALLOUT ===== */}
      <section className="wrap section home-section-bottom">
        <div className="card notice-card">
          <div className="notice-icon">
            <Info size={22} aria-hidden="true" />
          </div>
          <div className="notice-content">
            <h3>Responsible Machine Learning & Limitations</h3>
            <p>
              This system measures acoustic vocal delivery and scores resemblance to acted recordings in the CREMA-D dataset. It does not measure genuine human emotional state, psychological condition, or intent. Spoken words, cultural background, health, and personal variation all influence vocal sound. Do not use this tool to make evaluations, diagnoses, or decisions regarding individuals.
            </p>
            <div className="notice-links">
              <Link to="/about">About the research</Link>
              <span>&middot;</span>
              <Link to="/terms">Terms of use</Link>
              <span>&middot;</span>
              <Link to="/privacy">Privacy policy</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
