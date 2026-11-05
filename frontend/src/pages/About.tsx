import { Link } from "react-router-dom";
import { usePageMeta } from "../meta";
import PageHero from "../components/PageHero";
import { ShieldAlert, ArrowRight } from "lucide-react";

export default function About() {
  usePageMeta(
    "About the project",
    "How the speech emotion recognition model works: the CREMA-D dataset, features, training method, evaluation, and limitations.",
    "/about"
  );

  return (
    <div className="about-page">
      <PageHero
        kicker="Research & Foundation"
        title="About the Project"
        description="A machine-learning exploration of speech emotion recognition using the CREMA-D dataset, rigorous speaker-independent evaluation, and acoustic signal processing."
        videoSrc="/media/research-abstract.mp4"
        webmSrc="/media/research-abstract.webm"
        posterSrc="/media/research-abstract-poster.webp"
      />

      <div className="wrap section about-content" style={{ paddingTop: "0.5rem" }}>
        <div className="about-workspace-card">
          {/* Executive Summary & Research Foundation */}
        <section className="about-intro-split">
          <div className="intro-main">
            <p className="eyebrow">Academic Foundation</p>
            <h2>Vocal Affect Estimation via Machine Learning</h2>
            <p className="lead">
              Speech Emotion Recognition Using Machine Learning is a third-year B.Tech Information Technology minor project. It estimates which of six emotions a human voice recording most resembles using acoustic signal processing.
            </p>
            <p>
              Unlike natural language systems that analyze text semantics, this system examines acoustic prosody: pitch modulation, vocal timbre, formant resonance, and temporal energy dynamics. It assesses how something is spoken, independent of the words spoken.
            </p>
          </div>
          <div className="intro-meta-panel">
            <div className="meta-item">
              <span className="meta-label">Dataset</span>
              <strong>CREMA-D (Acted Speech)</strong>
            </div>
            <div className="meta-item">
              <span className="meta-label">Evaluation Paradigm</span>
              <strong>Speaker-Independent (14 Test Actors)</strong>
            </div>
            <div className="meta-item">
              <span className="meta-label">Representation Model</span>
              <strong>768-D Self-Supervised Embeddings</strong>
            </div>
            <div className="meta-item">
              <span className="meta-label">Active Model</span>
              <strong>emotion2vec+ (Base) + Logistic Regression</strong>
            </div>
          </div>
        </section>

        {/* The Dataset */}
        <section className="about-section">
          <div className="section-title-wrap">
            <p className="eyebrow">Dataset Grounding</p>
            <h2>The CREMA-D Corpus</h2>
          </div>
          <div className="about-grid-2">
            <div className="prose-block">
              <p>
                CREMA-D (Crowd-sourced Emotional Multimodal Actors Dataset) consists of 7,442 validated audio clips spoken by 91 professional actors (48 male, 43 female) of diverse ethnic backgrounds. Each actor spoke 12 standard sentences portraying specified emotions.
              </p>
              <p>
                <strong>Acted Nature of Speech:</strong> The recordings were produced by actors instructed to convey targeted emotions at specified intensities. Consequently, acoustic features reflect intentional, heightened emotional vocalization, which is distinct from spontaneous conversation in daily life.
              </p>
            </div>
            <div className="about-highlight-box">
              <h3>Class Distribution</h3>
              <ul className="stats-list">
                <li><span>Angry</span> <strong>1,271 clips</strong></li>
                <li><span>Disgust</span> <strong>1,271 clips</strong></li>
                <li><span>Fear</span> <strong>1,271 clips</strong></li>
                <li><span>Happy</span> <strong>1,271 clips</strong></li>
                <li><span>Sad</span> <strong>1,271 clips</strong></li>
                <li><span>Neutral</span> <strong>1,087 clips</strong></li>
              </ul>
              <p className="small-note">
                Class weights are balanced during training to ensure the slightly smaller neutral class is not penalized.
              </p>
            </div>
          </div>
        </section>

        {/* The Six Emotions */}
        <section className="about-section">
          <div className="section-title-wrap">
            <p className="eyebrow">Acoustic Profiles</p>
            <h2>The Six Evaluated Emotions</h2>
          </div>
          <div className="emotion-profile-grid">
            <div className="profile-card emo-card emo-happy">
              <div className="profile-header">
                <h3>Happy</h3>
                <span className="profile-pill">Expansive</span>
              </div>
              <p>Bright, cheerful vocalization with elevated mean pitch, dynamic melodic excursions, and bright spectral energy.</p>
            </div>
            <div className="profile-card emo-card emo-sad">
              <div className="profile-header">
                <h3>Sad</h3>
                <span className="profile-pill">Attenuated</span>
              </div>
              <p>Subdued, quiet delivery characterized by lowered mean pitch, reduced vocal amplitude, and extended pauses.</p>
            </div>
            <div className="profile-card emo-card emo-angry">
              <div className="profile-header">
                <h3>Angry</h3>
                <span className="profile-pill">High Energy</span>
              </div>
              <p>Loud, forceful speech featuring rapid acoustic attacks, expanded pitch ceiling, and elevated high-frequency tilt.</p>
            </div>
            <div className="profile-card emo-card emo-fear">
              <div className="profile-header">
                <h3>Fear</h3>
                <span className="profile-pill">Tense</span>
              </div>
              <p>Unsteady, hurried phonation exhibiting vocal jitter, heightened pitch variability, and acoustic micro-tremor.</p>
            </div>
            <div className="profile-card emo-card emo-disgust">
              <div className="profile-header">
                <h3>Disgust</h3>
                <span className="profile-pill">Strained</span>
              </div>
              <p>Drawn-out speech marked by lowered tempo, strained vocal tract resonance, and downward spectral glide.</p>
            </div>
            <div className="profile-card emo-card emo-neutral">
              <div className="profile-header">
                <h3>Neutral</h3>
                <span className="profile-pill">Baseline</span>
              </div>
              <p>Even, calm vocal delivery with stable pitch baseline, regular cadence, and absent emotional emphasis.</p>
            </div>
          </div>
        </section>

        {/* Feature Extraction */}
        <section className="about-section">
          <div className="section-title-wrap">
            <p className="eyebrow">Signal Processing</p>
            <h2>296-Dimensional Acoustic Extraction</h2>
          </div>
          <p className="section-intro">
            Every audio recording is preprocessed identically for training and real-time prediction: trimmed of leading and trailing silence, standardized to 16 kHz mono, and peak-normalized. From this clean audio signal, 296 acoustic features are extracted:
          </p>
          <div className="feature-category-grid">
            <div className="feat-cat">
              <h4>MFCCs &amp; Deltas (80)</h4>
              <p>40 Mel-Frequency Cepstral Coefficients plus 40 first-order delta coefficients capturing spectral envelope geometry and velocity.</p>
            </div>
            <div className="feat-cat">
              <h4>Log-Mel Filterbanks (40)</h4>
              <p>40 mel-scale filterbank energy bands mapping spectral power across perceptual auditory bands.</p>
            </div>
            <div className="feat-cat">
              <h4>Spectral Dynamics (14)</h4>
              <p>Spectral centroid (brightness), bandwidth, roll-off, flatness, and 7-band spectral contrast.</p>
            </div>
            <div className="feat-cat">
              <h4>Energy &amp; Voicing (8)</h4>
              <p>Root-mean-square energy, zero-crossing rate, voiced-to-unvoiced speech ratio, and amplitude percentiles.</p>
            </div>
            <div className="feat-cat">
              <h4>Pitch Modulation (4)</h4>
              <p>Fundamental frequency (F0) mean, standard deviation, minimum, and maximum tracked over voiced speech segments.</p>
            </div>
            <div className="feat-cat">
              <h4>Chroma &amp; Harmony (24)</h4>
              <p>12-dimensional chroma statistics measuring harmonic energy distribution across pitch classes.</p>
            </div>
          </div>
        </section>

        {/* Training & Evaluation Methodology */}
        <section className="about-section">
          <div className="section-title-wrap">
            <p className="eyebrow">Rigorous Methodology</p>
            <h2>Speaker-Independent Validation Protocol</h2>
          </div>
          <ol className="method-steps">
            <li>
              <strong>Dataset Verification:</strong> Every CREMA-D file is validated against the official manifest for matching file sizes and SHA-256 hashes to guarantee data integrity.
            </li>
            <li>
              <strong>Speaker Partitioning:</strong> 14 unseen actors (approx. 15% of speakers) are held out strictly for final evaluation. They are never seen during training or tuning.
            </li>
            <li>
              <strong>Model Selection:</strong> The 77 development actors are split into 5-fold cross-validation folds grouped strictly by speaker ID. The model with highest mean macro F1 wins.
            </li>
            <li>
              <strong>Refitting:</strong> The chosen model (SVM RBF, C=5.0) is refit on all 77 development actors with Platt probability calibration.
            </li>
            <li>
              <strong>Honest Testing:</strong> Final performance is scored exclusively on the 14 held-out test actors (1,147 clips), yielding true speaker-independent results.
            </li>
          </ol>
        </section>

        {/* Limitations & Ethical Use */}
        <section className="about-section about-bottom-callout">
          <div className="callout-card">
            <div className="callout-header">
              <ShieldAlert size={22} aria-hidden="true" />
              <h3>Limitations &amp; Responsible Use</h3>
            </div>
            <ul>
              <li>The system estimates acoustic resemblance to acted speech, not true psychological emotional state.</li>
              <li>Everyday conversational emotion is far more subtle and contextual than acted studio performances.</li>
              <li>Individual vocal timbre, microphone equipment, background room acoustics, and accents influence predictions.</li>
              <li>Never use this software to make decisions regarding employment, grading, diagnosis, or assessment of individuals.</li>
            </ul>
            <div className="callout-footer">
              <Link to="/evaluation" className="btn sub sm">
                <span>View Real Evaluation Metrics</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
