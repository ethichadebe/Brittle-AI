import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import { api, ApiError } from "../lib/api";
import { initials } from "../lib/format";
import type { Appearance } from "../lib/appearance";
import { useAccountSession } from "../hooks/useAccountSession";
import { useAppearance } from "../hooks/useAppearance";
import { useLoyaltySettings } from "../hooks/useLoyaltySettings";
import { PersonIcon } from "../components/icons";
import { Disclaimer } from "../components/Disclaimer";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// Profile (#115): who you are, and every setting, in one place. Replaces the
// separate Settings and Account screens.
function ProfilePage() {
  const navigate = useNavigate();
  const { account, setAccount } = useAccountSession();
  const { isEnabled, toggle } = useLoyaltySettings();
  const { appearance, setAppearance } = useAppearance();
  const [signingOut, setSigningOut] = useState(false);

  // #151: deleting needs the password, typed into a sheet that says plainly
  // what goes. Null when the sheet is closed.
  const [deletePassword, setDeletePassword] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeDelete = () => {
    setDeletePassword(null);
    setDeleteError(null);
  };

  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!deletePassword) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.account.deleteAccount(deletePassword);
      setDeletePassword(null);
      setAccount(null);
      navigate({ to: "/" });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Couldn't delete your account. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  };

  const loyaltyStores = STORE_CONFIGS.filter((s) => s.loyaltyProgramme !== null);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.account.signOut();
      setAccount(null);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="page-fade-in profile">
      <header className="list-header">
        <button className="btn-back" aria-label="Back" onClick={() => navigate({ to: "/" })}>‹</button>
        <h2 className="list-title">Profile</h2>
        <div style={{ width: 32 }} />
      </header>

      {account && (
        <div className="profile-who">
          <span className="profile-avatar" aria-hidden="true">{initials(account.email) || <PersonIcon />}</span>
          <span className="profile-email">{account.email}</span>
        </div>
      )}

      {account === null && (
        <div className="profile-card">
          <span className="profile-avatar" aria-hidden="true"><PersonIcon /></span>
          <p>Sign in to back up your lists and use them on any device.</p>
          <button className="btn btn-primary btn-block" onClick={() => navigate({ to: "/sign-in" })}>
            Sign in
          </button>
        </div>
      )}

      <div className="settings-section">
        <h3 className="settings-section-title">Loyalty cards</h3>
        {loyaltyStores.map((store) => (
          <div key={store.slug} className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">{store.loyaltyProgramme}</span>
              <span className="settings-row-sub">{store.name}</span>
            </div>
            <button
              role="switch"
              aria-checked={isEnabled(store.slug)}
              aria-label={`${store.loyaltyProgramme} at ${store.name}`}
              className={`toggle${isEnabled(store.slug) ? " toggle--on" : ""}`}
              onClick={() => toggle(store.slug)}
            />
          </div>
        ))}
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Appearance</h3>
        <div className="settings-row">
          <div className="segmented" role="radiogroup" aria-label="Appearance">
            {APPEARANCES.map((a) => (
              <button
                key={a.value}
                role="radio"
                aria-checked={appearance === a.value}
                className={`segmented-option${appearance === a.value ? " segmented-option--on" : ""}`}
                onClick={() => setAppearance(a.value)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {account && (
        <div className="settings-section">
          <button className="btn btn-danger-ghost btn-block profile-sign-out" disabled={signingOut} onClick={signOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <button className="profile-delete" onClick={() => setDeletePassword("")}>
            Delete account
          </button>
        </div>
      )}

      {deletePassword !== null && (
        <div className="modal-backdrop" onClick={() => !deleting && closeDelete()}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={deleteAccount}>
            <h3>Delete your account?</h3>
            <p className="modal-body">
              Your account, all your lists and your saved substitutes are deleted straight away. This can't be undone.
            </p>
            <input
              className="modal-input"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              aria-label="Your password"
              autoFocus
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={deleting} onClick={closeDelete}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger" disabled={!deletePassword || deleting}>
                {deleting ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="profile-legal">
        <Link to="/privacy">Privacy notice</Link>
        <Disclaimer />
      </div>

      {/* Which deploy this is (#118), for checking an update has landed. */}
      <p className="profile-version">Version {__BUILD_ID__.slice(0, 16).replace("T", " ")}</p>
    </div>
  );
}
