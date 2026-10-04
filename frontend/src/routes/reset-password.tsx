import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { tokenSearch, useLinkToken } from "../lib/linkToken";

export const Route = createFileRoute("/reset-password")({
  validateSearch: tokenSearch,
  component: ResetPasswordPage,
});

const MIN_PASSWORD_LENGTH = 8;

// #149: where the reset email's link lands. After the new password is saved,
// every session is signed out and the shopper signs in again with it, which
// also brings this device's lists across as any sign-in does.
function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = useLinkToken(Route.useSearch().token);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; linkDead: boolean } | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { email } = await api.account.completePasswordReset(token, password);
      void navigate({ to: "/sign-in", search: { email, notice: "password-changed" }, replace: true });
    } catch (e) {
      const linkDead = e instanceof ApiError && e.status === 400 && !/Password must/.test(e.message);
      setError({ message: e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.", linkDead });
      setBusy(false);
    }
  };

  return (
    <div className="page-fade-in sign-in">
      <header className="list-header">
        <div style={{ width: 32 }} />
        <h2 className="list-title">Reset password</h2>
        <div style={{ width: 32 }} />
      </header>
      {error?.linkDead ? (
        <div className="auth-form">
          <h1 className="auth-title">That link didn't work</h1>
          <p className="form-error auth-error" role="alert">{error.message}</p>
          <Link className="btn btn-primary btn-block auth-button-link" to="/forgot-password">Send a new link</Link>
        </div>
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length >= MIN_PASSWORD_LENGTH && !busy) void save();
          }}
        >
          <h1 className="auth-title">Choose a new password</h1>
          <input
            className="auth-input"
            type="password"
            autoComplete="new-password"
            autoFocus
            aria-label="New password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="auth-hint">At least {MIN_PASSWORD_LENGTH} characters</p>
          {error && <p className="form-error auth-error" role="alert">{error.message}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={password.length < MIN_PASSWORD_LENGTH || busy || !token}>
            {busy ? "…" : "Save new password"}
          </button>
        </form>
      )}
    </div>
  );
}
