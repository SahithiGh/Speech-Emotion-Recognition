import React, { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";
import AuthFullPageLayout from "../components/AuthFullPageLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [stage, setStage] = useState<"request" | "reset" | "done">("request");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email.trim()) {
      setError("Please enter your account email address.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      setMessage(data.message || "Password reset token generated.");
      if (data.token) {
        setResetToken(data.token);
      }
      setStage("reset");
    } catch (err: any) {
      setError(err.message || "Unable to request password reset.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!resetToken.trim()) {
      setError("Please provide your reset token.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken.trim(), password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail?.message || "Password reset failed");
      }
      setStage("done");
      setMessage("Your password has been successfully reset! You can now log in with your new password.");
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFullPageLayout
      kicker="Account Recovery"
      title="Reset Password"
      description="Regain access to your account and saved analyses."
    >
          {stage === "request" && (
            <form onSubmit={handleRequestToken} noValidate className="auth-form">
              {error && (
                <div className="callout warn" role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <p className="auth-note">
                Enter your email address and we will generate a password reset token for your account.
              </p>

              <div className="field">
                <label htmlFor="forgot-email">Email Address</label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="input-text"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn primary block submit-btn"
              >
                <KeyRound size={18} aria-hidden="true" />
                {submitting ? "Requesting token..." : "Send Reset Token"}
              </button>

              <div className="auth-footer">
                <p>
                  Remembered your password?{" "}
                  <Link to="/login" className="auth-link">
                    Return to Sign In
                  </Link>
                </p>
              </div>
            </form>
          )}

          {stage === "reset" && (
            <form onSubmit={handleResetPassword} noValidate className="auth-form">
              {message && (
                <div className="callout ok" role="status">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <span>{message}</span>
                </div>
              )}
              {error && (
                <div className="callout warn" role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="field">
                <label htmlFor="reset-token">Reset Token</label>
                <input
                  id="reset-token"
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste reset token"
                  className="input-text font-mono"
                />
              </div>

              <div className="field">
                <label htmlFor="reset-pwd">New Password</label>
                <input
                  id="reset-pwd"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input-text"
                />
              </div>

              <div className="field">
                <label htmlFor="reset-confirm">Confirm New Password</label>
                <input
                  id="reset-confirm"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="input-text"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn primary block submit-btn"
              >
                {submitting ? "Updating password..." : "Set New Password"}
              </button>
            </form>
          )}

          {stage === "done" && (
            <div className="auth-done text-center">
              <div className="callout ok" role="status">
                <CheckCircle2 size={24} aria-hidden="true" />
                <span>{message}</span>
              </div>
              <div style={{ marginTop: "1.5rem" }}>
                <Link to="/login" className="btn primary block">
                  Sign In Now
                </Link>
              </div>
            </div>
          )}
    </AuthFullPageLayout>
  );
}
