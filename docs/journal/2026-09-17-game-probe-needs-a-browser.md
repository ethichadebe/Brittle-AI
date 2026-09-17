# 2026-09-17 — Probing a store we cannot fetch with curl

- **Asked for:** "We can get started on game store for now." — after I
  recommended skipping Game.
- **Worked first time:** the probe did, offline. Against Game itself it has not
  run yet; that is the next round.
- **Laptop needed:** no.
- **Friction:**
  - **My recommendation was not taken, which is fine and is recorded as the
    user's call.** I said Game looked expensive (PerimeterX) and low-value (a
    general merchandiser). The decision is theirs; what follows is the honest
    version of the work rather than a reluctant one.
  - **Every previous probe was `curl` plus `python3`. This one cannot be.**
    game.co.za serves a 21KB shell for every route and fetches its catalogue
    only after the PerimeterX sensor mints a `_px3` cookie, so nothing a shell
    script can do will see a product. `scripts/probe-game.mjs` drives real
    Chromium instead.
  - **It runs inside the backend container**, the only place with Playwright and
    Chromium installed. `scripts/` is not copied into the image, so the probe is
    piped over stdin rather than requiring a rebuild to try a one-off.
  - **It mirrors production deliberately** — `playwright-extra` + stealth +
    `fingerprint-injector`, the same stack and launch args as
    `backend/src/scraper/playwright.ts`. A probe that passed PerimeterX with a
    different browser fingerprint than the scraper uses would prove nothing
    about the scraper.
  - **It answers exactly the three fields a Strategy needs:** does `_px3` get
    set (is Game reachable at all), which request carries the products
    (`interceptsUrl`), and what that payload looks like (`parse`). If the first
    is no, the other two are unanswerable and the honest verdict is to stop.
  - **JSON responses are ranked by product-likeness, not size or order.** The
    fixture includes two decoys precisely because the naive rules are wrong: a
    consent blob arrives first, and a feature-flag blob is far larger than the
    catalogue. Makro taught this one — ranking arrays by size there picked
    router config and facet values over the products.
  - **The fixture's catalogue response is deliberately slow (1200ms), and that
    was not the first draft.** With an instant localhost response, deleting the
    settle wait entirely still passed all thirteen assertions. On Game the XHR
    fires only after the sensor resolves, so losing that wait would make a live
    store report "no prices rendered" and I would have called it blocked. Adding
    the delay makes the same deletion fail seven assertions. A test that cannot
    fail is not a test, and this one could not until the fixture stopped being
    convenient.
  - **Four mutations checked in total:** rank by size instead of product
    shape, stop scoring price fields, drop the settle wait, and look for
    Checkers' `aws-waf-token` instead of `_px3`. Each fails the right
    assertions.
  - **Lint needed a genuine config addition, not a silencing.** `scripts/**/*.mjs`
    had no Node globals, so `console` and `process` produced 55 `no-undef`
    errors. Declaring the environment is not turning the rule off — a typo of
    `proccess.env` is still an error, which I checked rather than assumed. The
    one `eslint-disable-next-line` is on the arrow passed to `page.evaluate`,
    which really does run in Chromium where `document` exists, and carries that
    reason inline.
  - **The fixture is declared invented in the test file.** It proves the probe
    can find a catalogue request nobody told it about; it claims nothing about
    Game's real endpoint. That distinction is why `makro.ts` shipped reading an
    `imageUrl` that does not exist.
