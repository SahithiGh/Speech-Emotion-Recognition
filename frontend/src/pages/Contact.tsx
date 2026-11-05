import { useState, type FormEvent } from "react";
import { Info, Mail } from "lucide-react";
import { CONTACT_EMAIL, REPO_URL } from "../site";
import { usePageMeta } from "../meta";
import AuthFullPageLayout from "../components/AuthFullPageLayout";

export default function Contact() {
  usePageMeta("Contact", "How to report a problem or give feedback about the speech emotion recognition project.", "/contact");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ message?: string }>({});
  const [sent, setSent] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 10) { setErrors({ message: "Please write at least 10 characters so the message is useful." }); setSent(false); return; }
    setErrors({});
    const subject = encodeURIComponent("Speech Emotion Recognition feedback");
    const body = encodeURIComponent(`${message.trim()}${name.trim() ? `\n\n${name.trim()}` : ""}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <AuthFullPageLayout
      kicker="Direct Communication"
      title="Contact & Feedback"
      description="Questions, academic feedback, bug reports, or inquiries regarding the Speech Emotion Recognition model and codebase."
      videoSrc="/media/light-rays.mp4"
      posterSrc="/media/light-rays-poster.webp"
      maxWidth="620px"
    >
      <div className="contact-card-content">
        {CONTACT_EMAIL ? (
          <>
            <p className="contact-lead-text">
              This form opens your email program with the message addressed to the project owner. Nothing is sent until you press send there.
            </p>
            <form onSubmit={submit} noValidate className="auth-form">
              <div className="field">
                <label htmlFor="c-name">Your Name (optional)</label>
                <input
                  id="c-name"
                  className="input-text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Your Name"
                />
              </div>
              <div className="field">
                <label htmlFor="c-msg">Message</label>
                <textarea
                  id="c-msg"
                  className="input-text"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-invalid={!!errors.message}
                  aria-describedby={errors.message ? "c-err" : undefined}
                  placeholder="Write your feedback or issue description here..."
                  required
                />
                {errors.message && <p id="c-err" className="error" role="alert">{errors.message}</p>}
              </div>
              <button className="btn primary block submit-btn" type="submit">
                <Mail size={18} aria-hidden="true" /> Open email client
              </button>
              {sent && <p className="hint" role="status" style={{ marginTop: "0.5rem" }}>Your email program should have opened. If it did not, write directly to {CONTACT_EMAIL}.</p>}
            </form>
          </>
        ) : (
          <p className="banner info">
            <Info size={18} aria-hidden="true" />
            <span>No contact address has been configured for this copy of the project.</span>
          </p>
        )}

        <div className="contact-guide-box">
          <h3>Reporting an Issue</h3>
          <p>
            Useful details to include: what you did, what you expected, what happened, your browser, and the error shown on screen.
          </p>
          {REPO_URL && (
            <p className="contact-repo-link">
              GitHub repository: <a href={REPO_URL} target="_blank" rel="noopener noreferrer">{REPO_URL}</a>
            </p>
          )}
        </div>
      </div>
    </AuthFullPageLayout>
  );
}
