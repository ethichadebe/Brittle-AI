import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { tokenSearch, useLinkToken } from "../lib/linkToken";
import { track } from "../lib/analytics";

export const Route = createFileRoute("/confirm-email")({
  validateSearch: tokenSearch,
  component: ConfirmEmailPage,
});

// #148: where the sign-up email's link lands. It asks for one tap rather than
// confirming on load: mail apps and virus scanners open links by themselves,
// and one of those would otherwise spend the link before the shopper does.
function ConfirmEmailPage() {
  const navigate = useNavigate();
  const token = useLinkToken(Route.useSearch().token);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.account.confirmEmail(token);
      track("sign_up_confirmed");
      void navigate({ to: "/", replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="page-fade-in sign-in">
      <header className="list-header">
        <div style={{ width: 32 }} />
        <h2 className="list-title">Create account</h2>
        <div style={{ width: 32 }} />
      </header>
      <div className="auth-form">
        {error ? (
          <>
            <h1 className="auth-title">That link didn't work</h1>
            <p className="form-error auth-error" role="alert">{error}</p>
            <p className="auth-lead">Sign up again for a new link. If you already confirmed, just sign in.</p>
            <Link className="btn btn-primary btn-block auth-button-link" to="/sign-in" search={{ mode: "sign-up" }}>
              Sign up again
            </Link>
            <Link className="auth-switch" to="/sign-in">Sign in</Link>
          </>
        ) : (
          <>
            <h1 className="auth-title">Confirm your email</h1>
            <p className="auth-lead">One tap to finish creating your Accucery account.</p>
            <button className="btn btn-primary btn-block" disabled={busy || !token} onClick={() => void confirm()}>
              {busy ? "…" : "Confirm my email"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
