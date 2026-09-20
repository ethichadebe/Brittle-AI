# 2026-09-20 — What `/simplify` found, and what it did not

- **Asked for:** `/code-review` then `/simplify` over `2ea7382..HEAD`. The review
  half shipped earlier today; this is the simplify half.
- **Worked first time:** no. Two of the four review agents reported against a
  tree that had moved under them — my fault, not theirs.
- **Laptop needed:** no.
- **Friction:**

  - **The biggest find was not a simplification at all: 789 lines of test that
    CI never ran.** Seven shell harnesses, every one correctly exiting non-zero
    on failure, and `grep "test.sh" .github/workflows/ci.yml` returned nothing.
    "Test" in this repo meant "whatever vitest finds inside an npm workspace",
    so a test that is neither a vitest file nor inside a workspace had no home
    and silently was not one. That is the same failure this project has already
    paid for twice — cases appended after `process.exit`, and eight tests
    passing against broken wiring. It mattered most for `report.test.sh`, whose
    stated job is proving a secret cannot ride along into a comment on a
    **public** repo, unenforced on every pull request until now.

  - **The new `scripts` job was itself mutation-checked.** Breaking
    `botdefence`'s DataDome detection made the job exit 1 and name
    `probe-store.test.sh`, with the other five still running — a CI job that
    cannot fail is the same bug one level up. `probe-game.test.mjs` is
    deliberately excluded: it drives a real Chromium and needs the workspace
    installed, which would turn a free job into a browser job. Said so in the
    file rather than leaving it looking like an oversight.

  - **Two review agents were pointed at a moving target.** I gave them
    `2ea7382..origin/master` while `origin/master` was moving, so they reviewed
    a tree from before that morning's merge and correctly reported that
    `fillImageTemplate` does not collapse doubled slashes and that
    `smoke-scrapers.sh` does not read `STORE_CONFIGS` — both of which had
    landed an hour earlier. Their corrections were right for what they could
    see. Pin the range to a commit, not a branch name.

  - **Three unreachable guards, two of them mine from this morning.**
    `separates()` rejected empty value sets that `coverage() >= 0.5` had
    already excluded; `groups()` re-tested `0 < len(...)` behind a
    short-circuit that guaranteed it; and the value union was computed twice,
    once in `constant()` and once in the candidate filter. Now one
    `values_of()` and a single `2 <= len(...) <= 12` bound, which says the same
    thing in one place. Still 14/14, and both remaining guards still fail under
    mutation.

  - **`fillImageTemplate` was a lookup table written as control flow.** Three
    named replacements plus a catch-all strip were two mechanisms doing one
    job. It is now one regex over an `IMAGE_PARAMS` table, so adding a size
    Makro starts asking for is a line of data. Behaviour is identical — 77
    unit tests unchanged, and putting the letters-only regex back still fails
    five of them.

  - **Not done, deliberately: `probe-store.sh` spends ScraperAPI credits on a
    store it has just written off.** When the homepage carries a bot sensor,
    `[2]` prints "Needs a real browser" — and then `[3]` and `[4]` fetch the
    API and four search paths anyway. Those answer 403, `blocked()` counts 403
    as a WAF, and `fetch()` retries through ScraperAPI, up to `MAX_CREDITS`
    (3). The retried response is the same JS gate, so the credits buy nothing.
    `DEFENCES` is computed at line 192 and only ever printed; it gates nothing.
    The fix is small — set the existing `NO_SCRAPERAPI` when a sensor is found,
    with a flag to override — but it changes *when money is spent*, which is a
    behaviour change and wants its own test and the user's agreement, not a
    ride in a cleanup pull request. Raised rather than slipped in.

  - **Not done, deliberately: the Makro probes re-implement the scraper.**
    `balanced()`, the marker list, `title_of()` and the product-shape walk are
    transcribed into Python in every Makro probe, duplicating four functions
    `makro.ts` already exports — and both probes' own comments claim they find
    products "exactly the way makro.ts does", which is the one property a copy
    cannot hold. `probe-game.mjs` shows the alternative: a `.mjs` run inside the
    backend container, importing the real thing. But that trades a
    self-contained `curl | python3` anyone can paste onto a box for a
    dependency on a built backend, and `probe-makro.sh` — which holds two more
    copies — has no test at all. Given "don't restructure anything you can't
    test offline", this is the user's call, not mine.
