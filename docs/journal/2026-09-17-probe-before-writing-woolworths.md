# 2026-09-17 — Ask Woolworths before writing its scraper

- **Asked for:** a fourth store scraper, with the store chosen from the four
  declared-but-inactive slugs, and a probe script written before any scraper
  code. Woolworths was picked: it is the fourth big grocer, so it is the one
  that makes a grocery price comparison more complete.
- **Worked first time:** no code yet, deliberately — same as the Shoprite probe
  the day before. But the script itself did not work first time, and the way it
  failed is the point: see Friction.
- **Laptop needed:** yes, for running it. This session cannot reach
  woolworths.co.za, so the probe gets run on the VPS and its output pasted back.
- **Friction:**
  - `probe-shoprite.sh` was a *confirmation* probe — Checkers and Shoprite are
    one company on one platform, so it could ask a known endpoint a yes/no
    question. Woolworths is neither Shoprite Holdings nor on Pick n Pay's
    Constructor.io, so there is no endpoint to confirm. This one had to be a
    *discovery* probe: find what the site runs, then measure it against the two
    parsers that already exist. Copying the Shoprite probe's shape would have
    produced a script that could only ever answer "no".
  - The interesting question is still field names, not whether an API exists.
    So step [5] checks a captured response against what `shopriteGroup.ts`
    `normalise()` actually reads — treating `imageProductCardURL`/`imageURL` as
    alternatives and `bonusBuy` as optional, because that is what the code does.
    An earlier version scored a raw 6 fields and called a working shape 5/6.
  - Three bugs were found by running it against stub responses rather than by
    reading it, which is why the stubs were worth writing:
    - `curl`'s `%{content_type}` is `text/html; charset=utf-8` — it contains a
      space. The space-separated record split it across three variables, so
      `bytes` became `charset=utf-8` and every search-page check silently
      failed. Records are pipe-separated now.
    - The ScraperAPI credit counter incremented inside `$( )`, so it died with
      the subshell and reported 0 after spending 3. Under-reporting spend on a
      metered free tier is the worst direction to be wrong in; the counter is a
      file now.
    - A WAF-blocked request that then succeeded through the proxy reported
      "WAF: no sign of one", because the check re-read the proxy's reply.
      Whether Woolworths needs a residential proxy is one of the four things
      this probe exists to answer, so it now reports the direct attempt.
  - Credits: every step tries the direct IP first, which is free, and only falls
    back to ScraperAPI for a step the WAF actually blocked, capped at three and
    printed. The baseline in step [1] is Pick n Pay rather than Checkers —
    Checkers would have cost a credit just to prove the network works.
  - Output is kept under 40 columns like `smoke-scrapers.sh`, since the result
    gets read and pasted from a phone. Content types are shown as `json`/`html`
    tokens rather than truncated mid-word to stay inside that.
  - Backend tests were not run: no Postgres in this session, and it fails in
    `globalSetup.ts` before any test file loads. Nothing here touches
    TypeScript. Everything else in the CLAUDE.md list was run and is green.
