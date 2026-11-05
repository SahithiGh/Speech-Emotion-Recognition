import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../auth";
import AuthFullPageLayout from "../components/AuthFullPageLayout";

const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Real-time password strength evaluation
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: "None", color: "transparent" };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 1) return { score, label: "Weak (min 8 chars)", color: "#ef4444" };
    if (score <= 3) return { score, label: "Fair", color: "#f59e0b" };
    return { score, label: "Strong", color: "#10b981" };
  }, [password]);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();

    if (!cleanName) {
      setError("Please enter your full name.");
      return;
    }

    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail) || !cleanEmail.includes(".")) {
      setError("Please provide a valid email address with a valid domain (e.g., name@gmail.com).");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter your password confirmation.");
      return;
    }

    if (!termsAccepted) {
      setError("You must acknowledge the terms and privacy statement to proceed.");
      return;
    }

    setSubmitting(true);
    try {
      await register(cleanEmail, cleanName, password);
      navigate("/analyze", { replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please check the information and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFullPageLayout
      kicker="Create Account"
      title="Register"
      description="Set up your Speech Emotion Recognition profile to save audio analyses and track history."
    >
      <form onSubmit={handleSubmit} noValidate className="auth-form">
            {error && (
              <div className="callout warn" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="reg-name">Full Name</label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Jane Doe"
                className="input-text"
              />
            </div>

            <div className="field">
              <label htmlFor="reg-email">Email Address</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="input-text"
              />
            </div>

            <div className="field">
              <label htmlFor="reg-password">Password</label>
              <div className="input-group">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input-text"
                />
                <button
                  type="button"
                  className="input-suffix-btn"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {password && (
                <div className="pwd-strength" aria-live="polite">
                  <div className="pwd-meter-bar">
                    <div
                      className="pwd-meter-fill"
                      style={{
                        width: `${(strength.score / 5) * 100}%`,
                        backgroundColor: strength.color,
                      }}
                    />
                  </div>
                  <span className="pwd-meter-label" style={{ color: strength.color }}>
                    Strength: {strength.label}
                  </span>
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="reg-confirm">Confirm Password</label>
              <input
                id="reg-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type password"
                className={`input-text ${passwordsMismatch ? "invalid" : ""}`}
              />
              {passwordsMatch && (
                <span className="field-hint ok">
                  <CheckCircle2 size={14} /> Passwords match
                </span>
              )}
              {passwordsMismatch && (
                <span className="field-hint error">Passwords do not match</span>
              )}
            </div>

            <div className="field-checkbox">
              <input
                id="reg-terms"
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <label htmlFor="reg-terms">
                I acknowledge the <Link to="/terms" target="_blank">Terms</Link> and <Link to="/privacy" target="_blank">Privacy statement</Link>. Speech emotion predictions are estimates and not diagnostic psychological measurements.
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn primary block submit-btn"
            >
              <UserPlus size={18} aria-hidden="true" />
              {submitting ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Already have an account?{" "}
              <Link to="/login" className="auth-link">
                Sign in
              </Link>
            </p>
          </div>
    </AuthFullPageLayout>
  );
}
