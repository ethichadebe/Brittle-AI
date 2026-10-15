# 2026-10-15 — A shared link always shows its card

- **Asked for:** "update the information that appears when I share a link across different platforms; the share info should always show".
- **What was wrong:** the page had a title and description for shared links, but no picture, no full address and no tag for X. WhatsApp, Facebook and X then show a bare link or a text-only card, or nothing. And X's bot obeys robots.txt, which kept it out of `/lists/`, so a shared list link showed nothing there.
- **What changed:**
  - **A picture:** `frontend/public/og-image.jpg`, 1200 × 630 and 90 KB (WhatsApp accepts about 300 KB). It shows the app's teal, the logo and headline, and an example list totalled at Checkers and "R8.55 less at Pick n Pay". Its source is `scripts/og-image.html`, rendered by `node scripts/render-og-image.mjs`.
  - **The tags:** Open Graph for everyone, with the picture's size and alt text so a first share shows it without waiting, plus X's large-picture card.
  - **Full addresses without the domain in the repo:** `index.html` says `__SITE_ORIGIN__`, and the app's nginx puts `https://` and the address the visitor asked for in its place as it serves the page. It's the same card on every page, since every page is index.html.
  - **robots.txt:** the link-preview bots (X, Facebook, WhatsApp, Telegram, LinkedIn, Slack, Discord, Pinterest) get their own group allowing every page but `/api/`. They only read the page's head: lists come from the API.
- **Worked first time:** mostly.
  - The real `nginx.conf` was run locally on the built app: `/`, `/welcome`, a list's address and `/index.html` all came back with full addresses, no placeholder left, and the security headers intact.
  - Three slips, all caught before the PR:
    - the first picture was a 361 KB PNG, now a JPEG;
    - a test regex was over-escaped;
    - lint rejected the renderer in `frontend/`, so it moved to `scripts/`, where Node scripts belong.
- **Laptop needed:** no.
- **Friction:** platforms cache a link's card. Links shared before this deploy keep their old preview, and Facebook can be told to look again with its Sharing Debugger.
