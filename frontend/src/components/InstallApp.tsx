import { useState } from "react";
import { promptInstall, useInstallWay } from "../lib/install";

// "Install app" on the landing page (2026-10-21): one tap where the browser
// can install a site, and short steps where it can't (lib/install.ts).
export function InstallApp() {
  const way = useInstallWay();
  const [help, setHelp] = useState<"ios-steps" | "open-in-browser" | null>(null);
  if (!way) return null;

  const tap = () => {
    if (way === "prompt") void promptInstall();
    else setHelp(way);
  };

  return (
    <>
      <button className="btn btn-pill landing-install" onClick={tap}>
        <DownloadIcon /> Install app
      </button>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(null)}>
          <div className="modal install-help" role="dialog" aria-labelledby="install-help-title" onClick={(e) => e.stopPropagation()}>
            {help === "ios-steps" ? (
              <>
                <h3 id="install-help-title">Add Accucery to your home screen</h3>
                <ol>
                  <li>
                    Tap <strong>Share</strong> <ShareIcon /> at the bottom of Safari.
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong>. Accucery opens from your home screen like any app.
                  </li>
                </ol>
              </>
            ) : (
              <>
                <h3 id="install-help-title">Open Accucery in your browser first</h3>
                <p className="modal-body">This app's built-in browser can't install apps.</p>
                <ol>
                  <li>
                    Tap <strong>⋯</strong> at the top right.
                  </li>
                  <li>
                    Tap <strong>Open in browser</strong> (or Open in Chrome, or Open in Safari).
                  </li>
                  <li>
                    There, tap <strong>Install app</strong> again.
                  </li>
                </ol>
              </>
            )}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setHelp(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="install-share" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="the Share button">
      <path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
