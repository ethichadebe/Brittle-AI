import "@fontsource-variable/inter";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { applyAppearance, readAppearance } from "./lib/appearance";

// Before the first render, so a chosen Appearance never flashes the phone's.
applyAppearance(document.documentElement, readAppearance(() => window.localStorage));

const router = createRouter({ routeTree });

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
