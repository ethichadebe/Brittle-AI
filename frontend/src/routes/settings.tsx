import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { STORE_CONFIGS } from "@accucery/types";
import { useLoyaltySettings } from "../hooks/useLoyaltySettings";
import { useAccountSession } from "../hooks/useAccountSession";
import { useAppearance } from "../hooks/useAppearance";
import type { Appearance } from "../lib/appearance";

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { isEnabled, toggle } = useLoyaltySettings();
  const { account } = useAccountSession();
  const { appearance, setAppearance } = useAppearance();

  const loyaltyStores = STORE_CONFIGS.filter((s) => s.loyaltyProgramme !== null);

  return (
    <div className="page-fade-in">
      <header className="list-header">
        <button className="btn-back" onClick={() => navigate({ to: "/" })}>‹</button>
        <h2 className="list-title">Settings</h2>
        <div style={{ width: 32 }} />
      </header>

      <div className="settings-section">
        <h3 className="settings-section-title">Account</h3>
        <div
          className="settings-row settings-row--nav"
          onClick={() => navigate({ to: "/account" })}
        >
          <div className="settings-row-info">
            <span className="settings-row-label">
              {account ? "Signed in" : "Sign in or create an account"}
            </span>
            <span className="settings-row-sub">
              {account ? account.email : "Save your lists across devices"}
            </span>
          </div>
          <span className="chevron">›</span>
        </div>
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
              className={`toggle${isEnabled(store.slug) ? " toggle--on" : ""}`}
              onClick={() => toggle(store.slug)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
