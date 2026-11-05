import { usePageMeta } from "../meta";
import PageHero from "../components/PageHero";

export function Privacy() {
  usePageMeta("Privacy", "What this speech emotion recognition project does and does not do with your audio and data.", "/privacy");
  return (
    <>
      <PageHero
        kicker="Security & Data Integrity"
        title="Privacy Policy"
        description="Complete transparency regarding how audio is handled: local memory processing, no external storage, zero tracking, and absolute user consent."
        videoSrc="/media/orbit-network.mp4"
        posterSrc="/media/orbit-network-poster.webp"
      />

      <section className="wrap section narrow prose">
        <p className="muted">This describes how this project is built. It is not legal advice and makes no claim of regulatory compliance.</p>
        <h2>Audio and Video Processing</h2>
        <p>When you record or upload an audio or video file, processing occurs locally on your own computer. For video files, the audio stream is extracted in memory. The audio is analyzed in memory and is discarded immediately after processing. The system does not retain or store raw audio or video files on disk. Recordings are never added to the training data.</p>
        <p>The backend log records only the request method, path, status code, and execution time. It never records audio content, file names, or results.</p>
        <h2>User Accounts and Saved History</h2>
        <p>User accounts and saved analyses are stored in a local, self-contained SQLite database on your computer. Passwords are securely hashed with salted PBKDF2-HMAC-SHA256 (200,000 iterations). When you choose to save an analysis, only computed metrics (emotion labels, confidence scores, transcripts, and consistency evaluations) are preserved. Raw audio and video tracks are never stored. You have complete control to delete individual saved analyses or permanently erase your account at any time.</p>
        <h2>Stored in your browser</h2>
        <p>Only one item: your light or dark theme choice, kept in your browser's local storage so it persists. Because it is essential to the setting you chose and is not used for tracking, no consent banner is shown. Clearing site data removes it.</p>
        <h2>Microphone</h2>
        <p>The microphone is used only while you press Start recording, and is released when recording stops. Your browser asks for permission first and you can revoke it in the browser's site settings.</p>
        <h2>If you host this project online</h2>
        <p>The privacy properties above describe local use. If the owner deploys the backend on a server, audio would travel to that server and this page must be updated to describe it.</p>
        <h2>Other people's voices</h2>
        <p>Only record people who have agreed to it. A voice recording can identify a person.</p>
      </section>
    </>
  );
}

export function Terms() {
  usePageMeta("Terms", "Terms of use for the speech emotion recognition project: educational use, no warranty, and no decisions about people.", "/terms");
  return (
    <>
      <PageHero
        kicker="Educational Use & Governance"
        title="Terms of Use"
        description="Academic purpose, non-consequential usage guidelines, absence of commercial warranty, and dataset licensing principles."
        videoSrc="/media/orbit-network.mp4"
        posterSrc="/media/orbit-network-poster.webp"
      />

      <section className="wrap section narrow prose">
        <p className="muted">This is an educational minor project, not a commercial service. These terms are plain-language guidance and not a legal contract reviewed by a lawyer.</p>
        <h2>Purpose</h2>
        <p>The system is provided for learning and demonstration. It estimates which acted emotion a voice resembles.</p>
        <h2>Not for decisions about people</h2>
        <p>Do not use the output to evaluate, hire, grade, diagnose, monitor or make any decision about a person. It is not a medical or psychological tool.</p>
        <h2>No warranty</h2>
        <p>Predictions can be wrong. The software is provided as is, without warranty of any kind. Measured accuracy applies to acted CREMA-D speech and may not carry over to other voices.</p>
        <h2>Consent</h2>
        <p>Use only recordings of yourself or of people who have given permission.</p>
        <h2>Dataset</h2>
        <p>The model is trained on the CREMA-D dataset. The dataset is not included in this project and remains subject to its own license and citation requirements.</p>
      </section>
    </>
  );
}
