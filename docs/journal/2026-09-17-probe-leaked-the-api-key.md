# 2026-09-17 — The probe printed the ScraperAPI key

- **Asked for:** probe Makro as the fifth store.
- **Worked first time:** no. Makro sits behind a WAF, and the first proxied
  request printed the ScraperAPI key into the probe's own output.
- **Laptop needed:** no.
- **Friction:**
  - Yesterday's redirect fix added `%{url_effective}` to `curl -w` so the probe
    could report where a store's root redirects to. On a store that needs the
    residential proxy, the effective URL **is** the ScraperAPI URL, and the key
    is a query parameter on it. The output read
    `landed on: api.scraperapi.com/?api_key=...`, on a script whose own header
    says "Prints no secrets". Four stores had been probed without a WAF since
    that change went in, so nothing exercised the path until Makro.
  - The field is now suppressed entirely when a response came back through the
    proxy, and any surviving `api_key=` is rewritten to `REDACTED` as a second
    line of defence. Suppressing is also the more correct answer: through the
    proxy the effective URL is the proxy's own, not the store's redirect target,
    which is the only reason the field exists.
  - Verified by stub rather than by reading: a fake WAF'd store with a known key
    in `.env`, then grepping the whole output for that key. Zero occurrences.
    That check is the thing worth keeping — "I removed the leak" is a claim, and
    grepping the output for the secret is evidence.
  - **Makro burned all three credits before the useful step.** The homepage,
    the Shoprite-endpoint guess and the first search path each cost one, then
    the cap was hit and everything after ran direct and was blocked — so the
    fingerprint reported "no search page answered", which looks exactly like
    SPAR's signature and means something completely different. The cap now says
    so out loud and suggests rerunning with `MAX_CREDITS=8`.
  - Worth deciding before any Makro code: Makro has a WAF, so like Checkers and
    Shoprite **every Makro search in production costs a ScraperAPI credit**.
    Woolworths cost nothing. That is an ongoing running cost, not a one-off.
