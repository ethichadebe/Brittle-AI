// Renders the app icon (frontend/public/icon.svg) to the PNGs each platform
// needs (#118). Run after changing icon.svg:
//   node scripts/render-app-icons.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const dir = new URL("../frontend/public", import.meta.url).pathname;
const svg = readFileSync(`${dir}/icon.svg`, "utf8");
const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<rect[^>]*\/>/, "");
// Maskable: Android may crop to a circle 80% wide, so the mark shrinks into it.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0d7a70"/><g transform="translate(256 256) scale(0.74) translate(-256 -256)">${inner}</g></svg>`;
// PLAYWRIGHT_CHROMIUM picks a browser other than the bundled one, if needed.
const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await b.newPage();
for (const [name, src, size] of [["icon-192.png", svg, 192], ["icon-512.png", svg, 512], ["icon-maskable-512.png", maskable, 512], ["apple-touch-icon.png", svg, 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${src.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `${dir}/${name}`, omitBackground: false });
}
await b.close();
