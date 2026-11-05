import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "../auth";
import AuthFullPageLayout from "../components/AuthFullPageLayout";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as any)?.from?.pathname || "/analyze";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter both your email address and password.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please verify your email and password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFullPageLayout
      kicker="Account Access"
      title="Sign In"
      description="Access your saved audio analyses, personal history, and evaluation records."
    >
      <form onSubmit={handleSubmit} noValidate className="auth-form">
        {error && (
          <div className="callout warn" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="login-email">Email Address</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="input-text"
          />
        </div>

        <div className="field">
          <div className="field-header">
            <label htmlFor="login-password">Password</label>
            <Link to="/forgot-password" className="field-link">
              Forgot password?
            </Link>
          </div>
          <div className="input-group">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn primary block submit-btn"
        >
          <LogIn size={18} aria-hidden="true" />
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="auth-footer">
        <p>
          Don't have an account yet?{" "}
          <Link to="/register" className="auth-link">
            Create one now
          </Link>
        </p>
      </div>
    </AuthFullPageLayout>
  );
}
