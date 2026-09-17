# 2026-09-17 — Makro's image URLs are templates, not URLs

- **Asked for:** Makro search returns products but no images.
- **Worked first time:** no — and my first hypothesis was wrong in an
  instructive way.
- **Laptop needed:** no.
- **Friction:**
  - **What the probe found.** `scripts/probe-makro-images.sh` walked the live
    page and answered all three questions at once: the images sit at
    `media.images[0..2].url`, the host is `www.makro.co.za` (88 of them), and
    the values carry Flipkart's `{@width}` / `{@height}` placeholders:

        https://www.makro.co.za/asset/rukmini/fccp/{@width}/{@height}/ng-...jpeg

  - **Two bugs, not one.** `makro.ts` read `node.imageUrl`, a field Makro does
    not have. But reading the right field would not have fixed it either: left
    as they are, the braces make the URL 404. `imageOf()` now reads
    `media.images[].url` and substitutes the placeholders.
  - **My hypothesis was wrong and the probe was right to exist.** I predicted
    the images would be on `rukminim*.flixcart.com` and need a new allowlist
    entry. The path fragment `asset/rukmini/fccp` shows the Flipkart pipeline is
    there, but Makro fronts it on its own domain, so `imageProxy.ts` was correct
    all along and needed no change. Shipping that prediction would have added a
    host that serves nothing.
  - **The mutation test caught my own test being useless.** Eight unit tests for
    `imageOf` all passed with `collectProducts` reverted to the dead
    `node.imageUrl` — because none of them exercised the wiring. That is exactly
    how the bug shipped in the first place: the helper was never the problem,
    what read it was. Added two tests that assert the path a real page takes,
    and the revert now fails. **Testing a unit is not testing that anything
    calls it.**
  - **Unknown placeholders are dropped, deliberately.** `{@width}`, `{@height}`
    and `{@quality}` are substituted by name; anything else matching `{@...}` is
    removed. Removing it is a guess, but leaving a literal brace in a URL is a
    certain 404.
  - **416×416 is a choice, not a measurement.** It is a plausible Flipkart size
    and the live check below is what confirms it serves. If it does not, the
    number changes and nothing else does.
  - **Found while here, not fixed:** `npm run test -w backend` needs Postgres,
    so CI skips the backend suite entirely — `makro.test.ts`, `woolworths.test.ts`,
    `imageProxy.test.ts` and `env-wiring.test.ts` have never run in CI. All 62
    of those tests are theatre until something runs them. Raised separately
    rather than folded in, because fixing it means touching the pipeline.
