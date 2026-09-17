# 2026-09-17 — Woolworths returned nothing because Compose never passed its key

- **Asked for:** turn Woolworths on and run a live test.
- **Worked first time:** no, three times over. The smoke test reported
  `woolworths milk 200 0s FAIL` on every attempt, and each failure had a
  different cause.
- **Laptop needed:** no, but the VPS was, and its web terminal dropped roughly
  every other command all evening.
- **Friction:**
  - **First failure: the merge was older than it looked.** PR #26 had been
    merged at its *second* commit, so master had the probe scripts and no
    scraper at all. "It has already been merged" was true and still meant the
    work was not deployed. A merged pull request cannot carry follow-up work, so
    the rest went out as #29. Worth checking what a merge actually contained
    rather than that it happened.
  - **Second failure: deploys had silently stopped.** `auto-deploy.sh` refuses
    to run when a tracked file is modified on the box, and it had been logging
    `SKIP` every seventy seconds for an hour. The cause was mine: to get probe
    output on a phone I had the human run `git checkout FETCH_HEAD -- scripts/...`
    inside `/opt/accucery`, which is the live deploy checkout, not a scratch
    directory. Two staged files were enough to stop every deploy. A copy under
    `/tmp` would have cost nothing. The guard behaved exactly right; it even
    tries to send a notification, which nobody received because the Telegram
    values in `.env` are still literal placeholders.
  - **Third failure, the real one: Compose only forwards the variables it
    names.** `WOOLWORTHS_SEARCH_KEY` was written into `.env`, documented in
    `.env.example`, and never added to `docker-compose.prod.yml`. Inside the
    container it was undefined, so the scraper threw, the engine caught it and
    fell through to the Playwright fallback, which returned an empty list
    immediately. Hence `200` with `0s` — a store that looks fine and sells
    nothing.
  - That is the same failure as `SCRAPERAPI_KEY` being absent from this
    deployment for four months, and it has now happened twice, so it gets a test
    rather than a lesson. `env-wiring.test.ts` scans `backend/src` for every
    `process.env.X` and asserts each one is declared in
    `docker-compose.prod.yml`. Checked by mutation: deleting the
    `WOOLWORTHS_SEARCH_KEY` line fails the test and names it.
  - `0s` in the smoke output was the diagnostic the whole way through. A real
    scrape takes seconds; an instant empty response means no network call
    happened at all. It distinguished "store not registered" from "scraper
    broken" without reading a single log line.
