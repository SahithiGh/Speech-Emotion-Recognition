import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { usePageMeta } from "../meta";
import PageHero from "../components/PageHero";

const ITEMS: [string, string][] = [
  [
    "What is Speech Emotion Recognition?",
    "Speech Emotion Recognition is a technology that analyzes vocal characteristics in your voice, such as pitch, rhythm, volume, and speech tone, to detect emotional expression. It focuses on how something is spoken rather than just the literal words spoken."
  ],
  [
    "How does this platform analyse my voice?",
    "When you upload an audio or video file or speak into your microphone, the platform examines physical vocal patterns across short time segments. It measures acoustic qualities such as pitch and vocal energy, compares them against established emotional patterns, and identifies the most prominent vocal tone."
  ],
  [
    "Which emotions can the system detect?",
    "The platform identifies six core emotional categories: Happy, Sad, Angry, Fear, Disgust, and Neutral. Along with the primary emotion, you can see a percentage breakdown of all six emotional states."
  ],
  [
    "Can I upload an audio or video recording for analysis?",
    "Yes. You can record your voice directly using your microphone or upload pre-recorded audio or video files. For video uploads, the platform automatically extracts the audio track in your browser so you do not need to convert files manually."
  ],
  [
    "Which audio and video formats are supported?",
    "The platform supports WAV, MP3, OGG, FLAC, and M4A audio files, as well as MP4, WebM, and MOV video files. Recordings should be under 15 MB in file size and between 0.5 seconds and 60 seconds in duration."
  ],
  [
    "Can the system analyse conversations with multiple speakers?",
    "Yes. The system automatically performs speaker diarization, which identifies different voices in the recording, separates their conversational turns, and tracks which speaker was speaking at each moment."
  ],
  [
    "How are different speakers identified?",
    "The platform groups speech segments by unique acoustic voice prints, distinguishing between different speakers (such as Speaker A and Speaker B) and detecting moments where people speak at the same time."
  ],
  [
    "Can I rename detected speakers?",
    "Yes. On the analysis results page, you can click the edit icon next to any speaker label to enter their actual name. Your custom names will update across the speaker cards, conversation timeline, and saved history."
  ],
  [
    "Can I view the transcript of my recording?",
    "Yes. The platform automatically generates a spoken word transcript with clickable timestamps. You can click any word or sentence to jump the audio player straight to that moment in the recording."
  ],
  [
    "Can I see how emotions change throughout a recording?",
    "Yes. You can explore dynamic visualizations that show emotional shifts across time, including a multi-lane conversation timeline, continuous emotion curves, and interval blocks."
  ],
  [
    "What is the difference between Emotion Tracks and Emotion Journey?",
    "Emotion Tracks displays six simultaneous curves showing the estimated intensity of each emotion second by second. Emotion Journey highlights the dominant emotional state in contiguous blocks across the timeline."
  ],
  [
    "What does a mismatch between vocal tone and transcript words mean?",
    "A mismatch happens when the emotional tone of your voice contrasts with the literal wording of your transcript (for example, polite words delivered in a frustrated tone). Such differences are natural in everyday speech and do not mean someone is being deceptive."
  ],
  [
    "How accurate are the emotion predictions?",
    "The predictions are acoustic estimates based on acted speech patterns. Because real human emotional expression varies greatly between individuals, cultures, and contexts, results should be viewed as helpful indicators rather than definitive psychological truth."
  ],
  [
    "Can background noise affect the results?",
    "High background noise can sometimes interfere with vocal clarity. To help with this, the application automatically applies noise reduction when background sound is detected, preserving the speech while suppressing ambient noise."
  ],
  [
    "The microphone does not work. What can I do?",
    "Make sure your browser has permission to access your microphone. Click the lock or settings icon in your browser address bar to allow microphone access, and verify that your microphone is enabled in your system settings. You can also upload a recorded audio file instead."
  ],
  [
    "Can I download my analysis report?",
    "Yes. You can export a comprehensive PDF report that includes your emotion scores, speaker participation, and transcript, or download structured CSV data packages for further review."
  ],
  [
    "Can I access my previous analyses?",
    "Yes. When signed in to your account, you can save your completed analyses and review them anytime from your Profile page, where you can also compare two recordings side by side."
  ],
  [
    "Is my uploaded audio stored securely?",
    "Yes. Your audio is processed locally and privately. Recordings are only saved to your personal history when you explicitly choose to save an analysis while signed in to your account."
  ],
  [
    "Can I delete my recordings and analysis results?",
    "Yes. You have complete control over your data. You can delete individual saved analyses from your Profile page or permanently delete your account and all associated data at any time."
  ]
];

export default function Faq() {
  usePageMeta(
    "FAQ",
    "Frequently asked questions about audio uploads, emotion detection, multiple speakers, transcripts, privacy, and report exports.",
    "/faq"
  );
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? ITEMS.filter(([a, b]) => (a + " " + b).toLowerCase().includes(t)) : ITEMS;
  }, [q]);

  return (
    <>
      <PageHero
        kicker="Help & Knowledge Base"
        title="Frequently Asked Questions"
        description="Clear answers about voice analysis, supported formats, speaker detection, transcripts, privacy, and exporting your results."
        videoSrc="/media/light-rays.mp4"
        webmSrc="/media/light-rays.webm"
        posterSrc="/media/light-rays-poster.webp"
      />

      <section className="wrap section prose" style={{ paddingTop: "0.5rem" }}>
        <div className="faq-workspace-card">
          <div className="search">
            <label htmlFor="faq-search">Search the questions</label>
            <div className="search-box">
              <Search size={18} aria-hidden="true" />
              <input
                id="faq-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="For example: speakers, noise, formats"
                autoComplete="off"
              />
            </div>
            <p className="hint" role="status">
              {shown.length} of {ITEMS.length} questions shown
            </p>
          </div>
          {shown.length === 0 && (
            <p className="card empty">
              No question matches "{q}". Try a different word, or{" "}
              <Link to="/contact">see how to get in touch</Link>.
            </p>
          )}
          <div className="faq">
            {shown.map(([a, b]) => (
              <details key={a}>
                <summary>{a}</summary>
                <p>{b}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
