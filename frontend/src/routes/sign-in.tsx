import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type ListCollision } from "../lib/api";
import { safeReturnPath } from "../lib/returnPath";

interface SignInSearch {
  then?: string;
  /** Filled in, e.g. after a password reset (#149). */
  email?: string;
  /** Start on "Create account", e.g. from an expired confirm link (#148). */
  mode?: "sign-up";
  notice?: "password-changed";
}

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    ...(typeof search.then === "string" && { then: search.then }),
    ...(typeof search.email === "string" && { email: search.email }),
    ...(search.mode === "sign-up" && { mode: "sign-up" as const }),
    ...(search.notice === "password-changed" && { notice: "password-changed" as const }),
  }),
  component: SignInPage,
});

// The server's own rule; repeated here only to say it before a round trip.
const MIN_PASSWORD_LENGTH = 8;

// Sign in or create an account, email first (#115). Which one is the
// Shopper's to say: the server deliberately never reveals whether an email
// has an account, so the app can't ask it.
function SignInPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { then } = search;
  // "sent": sign-up emailed a confirm link (#148), and nothing exists yet.
  const [step, setStep] = useState<"email" | "password" | "sent">(search.email ? "password" : "email");
  const [mode, setMode] = useState<"sign-in" | "sign-up">(search.mode ?? "sign-in");
  const [email, setEmail] = useState(search.email ?? "");
  const [resent, setResent] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Lists from this device that met one of the Account's own (#86), asked
  // about one at a time before leaving.
  const [collisions, setCollisions] = useState<ListCollision[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const leave = () => void navigate({ to: safeReturnPath(then), replace: true });

  useEffect(() => {
    if (step === "password") passwordRef.current?.focus();
  }, [step]);

  // Done once signed in and every collision is answered.
  useEffect(() => {
    if (signedIn && collisions.length === 0) leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leave only reads the search param
  }, [signedIn, collisions]);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "sign-up") {
        await api.account.signUp(email.trim(), password);
        setStep("sent");
        return;
      }
      const result = await api.account.signIn(email.trim(), password);
      setCollisions(result.collisions);
      setSignedIn(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // Dismissing the prompt (closing it without an explicit choice) resolves
  // as "keep-both" — per #86, a collision is never silently combined, and
  // combining is the one outcome that cannot be undone once items merge.
  const resolveCollision = async (resolution: "combine" | "keep-both") => {
    const [current, ...rest] = collisions;
    if (!current) return;
    setBusy(true);
    try {
      await api.account.resolveCollision(current.anonymousListId, resolution);
    } finally {
      setCollisions(rest);
      setBusy(false);
    }
  };

  // Signing up again sends a fresh link; the last one stops working.
  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.account.signUp(email.trim(), password);
      setResent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "sign-up" ? "sign-in" : "sign-up");
    setError(null);
  };

  const current = collisions[0];
  const passwordOk = mode === "sign-in" ? password.length > 0 : password.length >= MIN_PASSWORD_LENGTH;

  return (
    <div className="page-slide-in sign-in">
      <header className="list-header">
        <button
          className="btn-back"
          aria-label="Back"
          onClick={() => (step === "email" ? navigate({ to: "/profile" }) : setStep("email"))}
        >
          ‹
        </button>
        <h2 className="list-title">{mode === "sign-up" ? "Create account" : "Sign in"}</h2>
        <div style={{ width: 32 }} />
      </header>

      {step === "sent" ? (
        <div className="auth-form" role="status">
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-lead">
            We've sent a link to <strong>{email.trim()}</strong>. Open it to finish creating your account. It expires in 24
            hours.
          </p>
          <p className="auth-lead">
            Your lists stay on this device until then. If the link opens in a different browser, come back here afterwards and
            sign in: your lists come with you.
          </p>
          {error && <p className="form-error auth-error" role="alert">{error}</p>}
          {resent && <p className="auth-hint">Sent again. Only the newest link works.</p>}
          <p className="auth-privacy">Nothing there? Check your spam folder.</p>
          <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => void resend()}>
            {busy ? "…" : "Send it again"}
          </button>
          <button type="button" className="auth-switch" onClick={() => { setStep("email"); setResent(false); }}>
            Use a different email
          </button>
        </div>
      ) : step === "email" ? (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (emailValid) setStep("password");
          }}
        >
          <h1 className="auth-title">What's your email?</h1>
          <p className="auth-lead">Your lists are kept with your account, so they're there on any device you sign in on.</p>
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
          <button type="submit" className="btn btn-primary btn-block" disabled={!emailValid}>
            Continue
          </button>
        </form>
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordOk && !busy) void submit();
          }}
        >
          <h1 className="auth-title">{mode === "sign-up" ? "Choose a password" : "Enter your password"}</h1>
          <p className="auth-email">
            {email.trim()}
            <button type="button" className="auth-link" onClick={() => setStep("email")}>Change</button>
          </p>
          {/* For password managers, which want the email beside the password. */}
          <input type="email" autoComplete="username" value={email.trim()} readOnly hidden />
          <input
            ref={passwordRef}
            className="auth-input"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            aria-label="Password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "sign-up" && <p className="auth-hint">At least {MIN_PASSWORD_LENGTH} characters</p>}
          {search.notice === "password-changed" && mode === "sign-in" && !error && (
            <p className="auth-notice" role="status">Password changed. Sign in with your new one.</p>
          )}
          {error && <p className="form-error auth-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={!passwordOk || busy}>
            {busy ? "…" : mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
          {mode === "sign-in" && (
            <Link className="auth-switch" to="/forgot-password" search={{ email: email.trim() }}>
              Forgot password?
            </Link>
          )}
          {mode === "sign-up" && (
            <p className="auth-privacy">
              See how we look after your information in the <Link to="/privacy">privacy notice</Link>.
            </p>
          )}
          <button type="button" className="auth-switch" onClick={switchMode}>
            {mode === "sign-up" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </form>
      )}

      {current && (
        <div className="modal-backdrop" onClick={() => resolveCollision("keep-both")}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>You already have a "{current.name}" list</h3>
            <p className="collision-body">
              Combine this device's list into it, or keep both separately.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" disabled={busy} onClick={() => resolveCollision("keep-both")}>
                Keep both
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => resolveCollision("combine")}>
                Combine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
