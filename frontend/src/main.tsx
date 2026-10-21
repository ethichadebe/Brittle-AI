import "@fontsource-variable/inter";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { applyAppearance, readAppearance } from "./lib/appearance";
import { checkForUpdate, fetchServedBuild } from "./lib/appUpdate";
import { startAnalytics, trackPage } from "./lib/analytics";
import { startAdsUnlessPremium } from "./lib/ads";
import { api } from "./lib/api";
import { captureInstallPrompt } from "./lib/install";

// The browser offers to install the app early, often before React is up:
// kept for the landing page's Install app button (lib/install.ts).
captureInstallPrompt(window);

// Before the first render, so a chosen Appearance never flashes the phone's.
applyAppearance(document.documentElement, readAppearance(() => window.localStorage));

// #118: installable, and onto each new deploy. Production only: in dev Vite
// serves fresh code itself, and a service worker would only get in its way.
if (import.meta.env.PROD) {
  const update = () =>
    void checkForUpdate({
      current: __BUILD_ID__,
      fetchServedBuild,
      session: () => window.sessionStorage,
      reload: () => window.location.reload(),
    });
  update();
  // An installed app is resumed far more often than it's opened afresh.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") update();
  });
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.error("Service worker:", e));
    });
  }
}

const router = createRouter({ routeTree });

// Google Analytics: production only, and only once a Measurement ID is set
// (src/analyticsConfig.ts). One page view per screen the router settles on.
if (import.meta.env.PROD && startAnalytics()) {
  router.subscribe("onResolved", ({ toLocation }) => trackPage(toLocation.pathname));
}

// AdSense: production only, only once its publisher id is set
// (src/adsConfig.ts), and never for a Premium account (#172).
if (import.meta.env.PROD) void startAdsUnlessPremium(async () => (await api.premium.status()).premium);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
