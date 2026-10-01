import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import { api } from "../lib/api";
import { initials } from "../lib/format";
import type { Appearance } from "../lib/appearance";
import { useAccountSession } from "../hooks/useAccountSession";
import { useAppearance } from "../hooks/useAppearance";
import { useLoyaltySettings } from "../hooks/useLoyaltySettings";
import { PersonIcon } from "../components/icons";

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
        </div>
      )}
    </div>
  );
}
