# 2026-10-22 — Install app on the test site

- **Asked for:** a preview of the landing page's Install app button on Android.
- **Found:** on beta.accucery.com the button never shows.
  - Chrome offers install only after it fetches the manifest, the icons and the service worker.
  - Those fetches don't carry the site's password, so nginx answered 401 and Chrome gave up.
- **What changed:** `scripts/setup-beta.sh` now writes one extra nginx block.
  - It lets `/manifest.webmanifest`, `/sw.js`, `/icon.svg`, `/icon-*.png` and `/apple-touch-icon.png` through without the password.
  - These files are already public on the live site, so nothing new is exposed. Every page and the API still ask for the password.
- **Worked first time:** yes.
  - **The script's test** checks for the block, and that it is the only place the password is switched off.
  - **A real nginx** served those five files without the password and still answered 401 for `/`, `/index.html`, `/api/lists` and near-miss paths like `/manifest.webmanifest.bak`.
- **Laptop needed:** no. The owner re-runs the setup script on the server once after merging; it keeps the test site's `.env` and database.
