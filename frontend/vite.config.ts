import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { withCsp } from "./src/build/csp";
import { GA_MEASUREMENT_ID, isMeasurementId } from "./src/analyticsConfig";

// One id per build (#118). The app carries it, /version.json says which build
// the server is on, and sw.js changes with it so browsers install the new one.
const BUILD_ID = process.env.BUILD_ID || new Date().toISOString();

function buildId(): Plugin {
  return {
    name: "accucery-build-id",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
      const sw = readFileSync(new URL("./sw.js", import.meta.url), "utf8").replace("__BUILD_ID__", BUILD_ID);
      this.emitFile({ type: "asset", fileName: "sw.js", source: sw });
    },
  };
}

// The page's content security policy (#153), with the fingerprints of its
// inline splash script and style. Build only: the dev server injects scripts
// of its own.
function csp(): Plugin {
  return {
    name: "accucery-csp",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => withCsp(html, { analytics: isMeasurementId(GA_MEASUREMENT_ID) }) },
  };
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react(),
    buildId(),
    csp(),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
