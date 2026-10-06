import "@fontsource-variable/inter";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { applyAppearance, readAppearance } from "./lib/appearance";
import { checkForUpdate, fetchServedBuild } from "./lib/appUpdate";
import { startAnalytics, trackPage } from "./lib/analytics";

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
