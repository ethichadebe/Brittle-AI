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

## Second run — the cap was not the problem, and my diagnosis was wrong

Rerunning with `MAX_CREDITS=8` spent **3 of 8** and still reported no search page.
So the budget was never the constraint, and "rerun with a bigger cap" was a guess
dressed up as a fix.

What the rerun did expose is a waste that had been there since the script was
generalised. Step [2] fetches the store's homepage — on Makro that was 2.5MB
retrieved through the proxy, for a credit — and then discards it. Step [4] only
ever fingerprints a *search* page, and re-fetched `/` as its last candidate,
paying a second time for a page already on disk.

Two changes:

- `/` is gone from the search candidates, because step [2] already has it.
- When no search path answers, the fingerprint falls back to that homepage. A
  site names its search platform site-wide, in its bundles and preconnects, not
  only on a results page. The Woolworths finding came from a page that referenced
  `cnstrc.com`; there was no reason that had to be a results page.

On the stub this took the run from 3 credits to 1 and turned "no search page
answered" into a named platform.

Also worth recording: the first fix in this note nearly did not run at all. The
fallback was written inside the `else` of an `if [ -n "$FOUND" ]` the script had
already evaluated, so setting `FOUND` there could never have re-entered the
fingerprint branch. Caught by reading the surrounding code before trusting the
patch, which is the only reason it was not shipped as a silent no-op.
