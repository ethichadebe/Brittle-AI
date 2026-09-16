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

## Resolved — one missing line of YAML

The VPS's `docker-compose.prod.yml` had no `SCRAPERAPI_KEY: ${SCRAPERAPI_KEY}`
line under the backend service. The repo's copy has had one since the ScraperAPI
commits in May; the VPS's copy is a May-era file that was edited locally to bind
the frontend to `127.0.0.1:8082` instead of `80:80`, so `git pull` could never
update it. It sat four months behind.

The key was present in `.env` the whole time. Compose simply never passed it to
the container, so the code did exactly what it is written to do: no key means a
direct fetch, a direct fetch from a datacenter IP means 403, and the Playwright
fallback went direct too and got the same 403. Nothing was wrong with the
scraper. Adding the line and recreating the container returned real products on
the first try.

Worth keeping in mind next time:

- The reported symptom, "works locally, fails deployed", pointed at the scraper
  and at credentials. It was neither. The difference between the two
  environments was a config file that only exists on one of them.
- Three checks in a row each looked like the answer and were not: the cookie
  hypothesis (`storeContexts` was present), the stale-container-environment
  hypothesis (a forced recreate changed nothing), and the shell-environment
  hypothesis (both variables were unset in the shell). Reading the deployed
  compose file was what settled it, and it should have been the first thing
  looked at, because it was already known to differ from the repo.
- `docker compose up -d` reported `Running` rather than `Started` and recreated
  nothing, because the resolved config had not changed — the variable it would
  have changed was not referenced by the file. `--force-recreate` proved the
  container was not the problem.

Still open after this: the app has no nginx server block on the host, so it is
not reachable from outside the box; and the compose drift that caused this is
still there, waiting to swallow the next change.

## A live test, so "it works" means something

`scripts/smoke-scrapers.sh` runs both stores against three queries through the
app's own API and prints status, duration, product count and a sample per row.
It reads no config and touches no credentials, which is deliberate: the
diagnostic script needed `.env` and leaked a cookie doing it, and this one has
no reason to go near it.

Both paths were exercised before it shipped — the failure path against a stack
that cannot reach the stores (six rows of HTTP 500, reported rather than
crashing) and the success path against a stub returning the real product shape
recovered from the VPS. A script whose success path has never run is not a test.

## Output narrow enough to photograph

The smoke test's first output was a 70-column table, which wraps into unreadable
noise in a phone terminal — and a phone terminal is how this repo actually gets
driven. Rewritten to stay under 40 columns, measured on both the passing and the
failing path, because someone away from a keyboard can screenshot a result but
cannot select and copy one.

## Confirmed on the VPS: 6/6

```
checkers  milk   200  3s n=20  L=2
checkers  bread  200  2s n=20  L=4
checkers  coffee 200  2s n=20  L=8
pnp       milk   200  1s n=20  L=11
pnp       bread  200  1s n=20  L=1
pnp       coffee 200  0s n=20  L=0

PASS 6/6   loyalty: 26
```

Both stores, three queries each, twenty products every time. Pick n Pay matters
here as much as Checkers: it has no ScraperAPI branch and goes direct, so it is a
separate code path that had never been seen to succeed from that box. It does.

Loyalty prices arrive too — 26 across the six searches. An earlier milk-only
search returned `loyaltyPrice: null` for everything and raised the question of
whether that path worked at all; it was simply milk. The frontend side is wired
end to end as well: the settings toggle feeds `useLoyalty` into `computeSummary`
and the per-item price in the list view, and `summary.ts` covers both branches in
tests.

Checkers through a residential proxy costs 2-3 seconds and Pick n Pay under one.
No performance problem to chase.
