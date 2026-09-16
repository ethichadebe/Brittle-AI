# 2026-09-16 — A diagnostic for "Checkers works locally, not deployed"

- **Asked for:** start fixing the store scrapers. The reported symptom was narrower than that: Pick n Pay works everywhere, Checkers works on the developer's machine but not on the VPS.
- **Worked first time:** no fix yet, deliberately. This session cannot reach `checkers.co.za`, `pnp.co.za` or `api.scraperapi.com` — all denied by egress policy — so there is no way to reproduce the bug or verify a change here. Writing scraper fixes blind is how you get a diff that looks plausible and does nothing. What went in instead is the reproduction loop: a script the operator runs on the VPS that distinguishes the candidate causes.
- **Laptop needed:** yes, unavoidably. The bug only exists on the deployed box, and nothing in a cloud session can see it.
- **Friction:**
  - An earlier read of this was **wrong and worth recording**: the 403s seen when testing scrapers from the cloud session were assumed to be Checkers' and Pick n Pay's bot protection. They were not — the egress proxy was answering 403 to CONNECT, and the scrapers never reached either site. The proxy's own failure log said so. A plausible error message from the wrong layer cost a wrong diagnosis; the fix was to read the proxy log rather than the app log.
  - The leading hypothesis came out of the code, not the symptom. When `SCRAPERAPI_KEY` is set, `checkers.ts` stops sending cookies as a header but still parses `storeContexts` out of that same `CHECKERS_COOKIES` value and puts it in the POST body. So the VPS still needs `CHECKERS_COOKIES` populated, purely for a fragment buried inside it. Anyone concluding "we route through ScraperAPI now, cookies are not needed" would get an empty `storeContexts` and no products.
  - `playwright.ts` already carries the comment *"homepage may not set storeContexts on a fresh VPS visit — use env cookie"*. The same dependency was found and patched in the fallback path and left unguarded in the primary one.
  - This class of failure is silent by construction: `normalise()` returns `[]` for any unexpected shape, and the UI renders zero results as "No products found" — indistinguishable from a search that genuinely matched nothing. Making that distinction visible is the obvious follow-up regardless of which hypothesis wins.
  - The script prints no secrets — presence, length and response shape only. It was dry-run here with no `.env` and no network, which caught three bugs in it (doubled status codes, a missing temp file, and a verdict that shouted "likely the bug" when there was simply no config at all).

## Update — the script leaked a credential on its first real run

Running it on the VPS printed the `aws-waf-token` to the terminal. The script
sourced `.env` with `.`, and the real `CHECKERS_COOKIES` is one unquoted line of
semicolon-separated pairs, so bash executed fragments of it and echoed the value
in a `command not found` error. Compose parses those lines as literal
`KEY=VALUE`; `.` does not. The script now parses the file by hand and executes
nothing, verified against a `.env` shaped like the real one with a canary value
that never appears in the output.

Stating "it never prints secrets" and being wrong is worse than not claiming it.
The dry run here could not catch it, because the dry run had no `.env` at all —
the one condition under which the bug cannot fire.

A second bug surfaced the same way: `docker compose logs ... | sed` takes sed's
exit status, so the `|| echo` fallback never fired and an unreadable stack
looked identical to a silent one.

## Update — the hypothesis was wrong, and the scraper works

`storeContexts` is present on the VPS, so that idea is dead. More usefully, the
ScraperAPI path returns HTTP 200 with real products from the VPS right now. The
Checkers scraper is not broken at the scraping layer. The direct call from the
VPS does get a 403 HTML page, exactly as the code comments predict, which is
what ScraperAPI is there to solve.

The app check in step 5 was not a valid test: it asked `localhost`, and the 404
came back from `nginx/1.24.0 (Ubuntu)` while this repo ships `nginx:1.27-alpine`
in the frontend image. A host-level nginx owns port 80, so `localhost` reaches
that rather than the app. The app has to be tested through its real URL.
