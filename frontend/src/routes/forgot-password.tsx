import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api, ApiError } from "../lib/api";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (search: Record<string, unknown>): { email?: string } =>
    typeof search.email === "string" ? { email: search.email } : {},
  component: ForgotPasswordPage,
});

// #149: asks for a reset link. The answer never says whether the email has an
// account, so neither does this screen.
function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(Route.useSearch().email ?? "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.account.requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-slide-in sign-in">
      <header className="list-header">
        <button className="btn-back" aria-label="Back" onClick={() => navigate({ to: "/sign-in", search: { email: email.trim() || undefined } })}>
          ‹
        </button>
        <h2 className="list-title">Reset password</h2>
        <div style={{ width: 32 }} />
      </header>
      {sent ? (
        <div className="auth-form" role="status">
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-lead">
            If there's an account for <strong>{email.trim()}</strong>, we've sent it a link to choose a new password. It expires
            in an hour.
          </p>
          <p className="auth-privacy">Nothing there? Check your spam folder.</p>
          <Link className="auth-switch" to="/sign-in" search={{ email: email.trim() }}>Back to sign in</Link>
        </div>
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (emailValid && !busy) void send();
          }}
        >
          <h1 className="auth-title">Forgot your password?</h1>
          <p className="auth-lead">We'll email you a link to choose a new one.</p>
          <input
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            aria-label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="form-error auth-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={!emailValid || busy}>
            {busy ? "…" : "Email me a link"}
          </button>
        </form>
      )}
    </div>
  );
}
