import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { STORE_CONFIGS } from "@accucery/types";
import { useLoyaltySettings } from "../hooks/useLoyaltySettings";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { isEnabled, toggle } = useLoyaltySettings();

  const loyaltyStores = STORE_CONFIGS.filter((s) => s.loyaltyProgramme !== null);

  return (
    <div className="page-fade-in">
      <header className="list-header">
        <button className="btn-back" onClick={() => navigate({ to: "/" })}>‹</button>
        <h2 className="list-title">Settings</h2>
        <div style={{ width: 32 }} />
      </header>

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
