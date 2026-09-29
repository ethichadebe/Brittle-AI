import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api, ApiError, type ListCollision } from "../lib/api";
import { useAccountSession } from "../hooks/useAccountSession";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const { account, setAccount } = useAccountSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Collisions left over from #85, resolved one at a time — see #86. Only
  // ever set right after a sign-up/sign-in that reported some.
  const [collisions, setCollisions] = useState<ListCollision[]>([]);

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === "sign-up"
          ? await api.account.signUp(email, password)
          : await api.account.signIn(email, password);
      setAccount(result);
      setEmail("");
      setPassword("");
      setCollisions(result.collisions);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await api.account.signOut();
      setAccount(null);
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

  const current = collisions[0];

  return (
    <div className="page-fade-in">
      <header className="list-header">
        <button className="btn-back" onClick={() => navigate({ to: "/settings" })}>‹</button>
        <h2 className="list-title">Account</h2>
        <div style={{ width: 32 }} />
      </header>

      {account === undefined && <p className="account-status">Checking…</p>}

      {account && (
        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">Signed in</span>
              <span className="settings-row-sub">{account.email}</span>
            </div>
            <button className="btn btn-ghost" disabled={busy} onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {account === null && (
        <div className="account-form">
          <input
            className="modal-input"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="modal-input"
            type="password"
            placeholder="Password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          {error && <p className="account-error">{error}</p>}
          <button
            className="btn btn-primary"
            disabled={!email.trim() || !password || busy}
            onClick={handleSubmit}
          >
            {busy ? "…" : mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
          <button
            className="account-switch"
            onClick={() => {
              setMode(mode === "sign-up" ? "sign-in" : "sign-up");
              setError(null);
            }}
          >
            {mode === "sign-up" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
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
