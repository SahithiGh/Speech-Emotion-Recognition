import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { usePageMeta } from "../meta";
import PageHero from "../components/PageHero";

const ITEMS: [string, string][] = [
  ["Which model architecture is deployed in Production?", "The primary production model is emotion2vec+ (Base) + Logistic Regression (C=0.05), utilizing 768-dimensional self-supervised latent speech representations. The system also preserves baseline SVM (296 acoustic features) and Option 2 Staging profiles for comparative benchmarks and deterministic rollback."],
  ["Why does the application detect and reject noisy audio?", "Reliable emotion recognition requires distinguishing intentional vocal timbre from ambient interference. When heavy background noise or low signal-to-noise ratio (SNR < 3.5 dB) corrupts the recording, the system rejects the classification rather than outputting an arbitrary or misleading emotion label."],
  ["What does vocal emotion versus transcript sentiment mismatch mean?", "The platform evaluates both acoustic tone (pitch, timbre, cadence) and transcribed lexical sentiment. A mismatch indicates that the vocal delivery contrasts with the literal wording (for example, saying cheerful words in a strained tone). Such divergence is natural in human conversation (e.g., understatement or formal restraint) and does not signify deceit."],
  ["Is my audio stored or sent anywhere?", "No. Audio goes from your browser to the backend running on your own computer, is analyzed in memory and is discarded. For video files, the audio track is extracted locally in memory. Nothing is uploaded to the internet or external cloud APIs by this project."],
  ["Which audio and video formats work?", "WAV, MP3, OGG, FLAC, and M4A audio files, as well as MP4, WebM, and MOV video files are supported. When a video is uploaded, its acoustic audio track is extracted locally and analyzed. Multiple files can be uploaded together in a batch queue. Files must be under 15 MB and 60 seconds, with at least half a second of speech."],
  ["Why does the result say Model not trained?", "The model only exists after a real training run on the CREMA-D audio. Run download_dataset.bat, then train_model.bat. Until then the site shows no metrics and disables analysis rather than guessing."],
  ["Does the result tell me how I really feel?", "No. It shows which acted emotion your voice sounds most like. People express emotion differently, and the model was trained on actors, so treat the result as a rough estimate."],
  ["Why is the accuracy not 100%?", "Emotion in speech is ambiguous, even for people. The evaluation page reports accuracy on speakers the model has never heard, which is a harder and more honest test than testing on voices it learned from."],
  ["Why were my recordings not added to the training data?", "By design. Your recordings are for testing only, so the reported results stay trustworthy and your voice is not kept without your consent."],
  ["What do the percentage scores mean?", "They rank the six emotions for this clip and add up to 100%. They are model scores, not the probability that a person feels an emotion."],
  ["The microphone does not work. What can I do?", "Use Chrome or Edge at http://localhost:5173, click Allow when asked, and check Windows Settings under Privacy and security, Microphone. Close other programs that use the microphone. You can always upload a file instead."],
  ["Why does the model get my clip wrong?", "Common reasons: background noise, a very short clip, a different accent or language, strong emotion that is not acted, or clipping from a loud microphone. The notes under a result mention problems the system could detect."],
  ["Can I retrain the model?", "Yes. Run train_model.bat again. Add --no-cache to recompute features or --deep-verify to check every file's SHA-256 first. Training is reproducible because the random seed is fixed and recorded."],
  ["When does the site say a result is uncertain?", "Only when validation data shows the model was usually wrong for clips with a similar top score, and enough validation clips exist to say so. The figure shown comes from the saved evaluation. If no such evidence exists for a score range, the site makes no uncertainty claim."],
  ["Does it support Hindi or Telugu?", "No. Only English is supported for now, because the model is trained and tested on English CREMA-D. Other languages would need their own datasets and evaluation first."],
  ["Does it work offline?", "Yes, after setup and the one-time dataset download. It needs no paid service, cloud or GPU."],
];

export default function Faq() {
  usePageMeta("FAQ", "Answers about privacy, accuracy, supported audio formats, microphone problems and retraining for the speech emotion recognition project.", "/faq");
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
        description="Comprehensive explanations regarding audio formats, local privacy guarantees, microphone setup, accuracy benchmarks, and retraining options."
        videoSrc="/media/light-rays.mp4"
        webmSrc="/media/light-rays.webm"
        posterSrc="/media/light-rays-poster.webp"
      />

      <section className="wrap section prose" style={{ paddingTop: "0.5rem" }}>
        <div className="faq-workspace-card">
          <div className="search">
            <label htmlFor="faq-search">Search the questions</label>
            <div className="search-box"><Search size={18} aria-hidden="true" /><input id="faq-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: microphone" autoComplete="off" /></div>
            <p className="hint" role="status">{shown.length} of {ITEMS.length} questions shown</p>
          </div>
          {shown.length === 0 && <p className="card empty">No question matches "{q}". Try a different word, or <Link to="/contact">see how to get in touch</Link>.</p>}
          <div className="faq">
            {shown.map(([a, b]) => (<details key={a}><summary>{a}</summary><p>{b}</p></details>))}
          </div>
        </div>
      </section>
    </>
  );
}
