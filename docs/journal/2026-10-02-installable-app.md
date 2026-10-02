# 2026-10-02 — Redesign 9/9: installable app

- **Asked for:** #118, a home-screen app from the browser on Android,
  iPhone and Huawei ("route 1"), launching full-screen with a teal status
  bar, and onto each new deploy without the stale-tab problem seen during
  #98.
- **Worked first time:** yes, apart from one check: Chrome said "not
  installable" because the test browser was incognito. In a normal profile
  it's installable, with a clean manifest.
- **Laptop needed:** no.
- **Friction:**

  - **Icon grilled with drawings.** Three ideas, then three blends; the
    owner chose the "A" with a tick (`frontend/public/icon.svg`).
    `scripts/render-app-icons.mjs` turns it into the PNGs Android and
    iPhone need, including a "maskable" one that keeps the A inside the
    circle Android may crop to.

  - **How a deploy reaches an open app.** Every build has an id. The app
    carries it, `/version.json` says which one the server is on, and when
    they differ the app reloads onto the new one, at start and whenever it
    comes back to the foreground (grilled: reload by itself rather than
    ask). It reloads once per new build, so a cache that keeps serving the
    old page can't cause a reload loop. Profile shows "Version …" to check
    which build a phone is on.

  - **The service worker never caches a price.** `/api/*` passes straight
    through. Pages are network-first, so online a deploy is always picked
    up; only when the network fails, or takes over 3 s, does the cached
    shell open. Content-hashed `/assets/*` are cached, as is safe.

  - **nginx now says what may be cached.** `index.html`, `sw.js` and the
    manifest are `no-cache`, `version.json` is `no-store`, and `/assets/`
    is cached for a year. Checked by running this exact config locally.

  - **Two limits worth knowing.**
    - Installing needs HTTPS. The system nginx in front of the app on the
      server is where that lives, and a cloud session can't see it.
    - On iPhone, an installed web app can't have a teal status bar: iOS
      only offers light or dark there. Android gets teal.

  - **One lint addition:** `frontend/sw.js` runs in a service worker's
    global scope, so the config declares that environment for that one
    file, like `scripts/` declares Node. No rule is silenced.

  - **Mutation-checked:** without the "came back to the app" check, the
    second deploy is never picked up, and the test fails.

  - **Next:** the redesign is done. Parked: #92, #88, #87, #78, #79, #28,
    #66, and grilling #108 (share a list) and #109 (Google sign-in).
