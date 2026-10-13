import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PrivacyNotice } from "../components/PrivacyNotice";
import { ADSENSE_CLIENT, isPublisherId } from "../adsConfig";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

// #150: the privacy notice POPIA asks for. Its words are in
// components/PrivacyNotice.tsx.
function PrivacyPage() {
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? window.history.back() : void navigate({ to: "/" }));

  return (
    <div className="page-fade-in privacy">
      <header className="list-header">
        <button className="btn-back" aria-label="Back" onClick={back}>‹</button>
        <h2 className="list-title">Privacy</h2>
        <div style={{ width: 32 }} />
      </header>

      <PrivacyNotice adsOn={isPublisherId(ADSENSE_CLIENT)} />
    </div>
  );
}
