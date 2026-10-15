// Renders scripts/og-image.html to frontend/public/og-image.jpg: the picture
// a shared link shows. From the repo root: node scripts/render-og-image.mjs
// (CHROMIUM=/path/to/chrome to use a Chromium other than Playwright's own).
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const font = require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");

const html = readFileSync(join(here, "og-image.html"), "utf8").replace("INTER_URL", pathToFileURL(font).href);
const page = join(here, ".og-image.rendered.html");
writeFileSync(page, html);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await tab.goto(pathToFileURL(page).href);
  await tab.evaluate("document.fonts.ready");
  // JPEG, to stay well under the 300 KB WhatsApp accepts for a preview picture.
  await tab.screenshot({ path: join(here, "..", "frontend", "public", "og-image.jpg"), type: "jpeg", quality: 88 });
} finally {
  await browser.close();
  rmSync(page, { force: true });
}
console.log("wrote frontend/public/og-image.jpg");
