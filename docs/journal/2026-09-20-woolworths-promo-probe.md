# 2026-09-20 — One run that answers both Woolworths issues

- **Asked for:** issue #27 (which price zone an anonymous shopper actually pays)
  and issue #28 (read the loyalty price from `product_promo_info` instead of
  parsing marketing copy).
- **Worked first time:** no. The first version carried a guard that no test
  could exercise, and said so in a test name.
- **Laptop needed:** no to build it. Yes to run it — it needs the live search
  response, which a cloud session cannot reach.
- **Friction:**

  - **#27 does not need anyone to read a product page.** The issue proposes
    opening a product as an anonymous visitor and comparing the displayed price
    against the zones. Its own footnote is the better method and is fully
    automatic: on a promoted product the copy carries `Now R<x> Save R<y>`, and
    `x + y` is whatever Woolworths itself treats as the regular price. Comparing
    that sum against p10/p30/p60 names the zone arithmetically, on every
    promoted product in the response at once. One command, no judgement calls,
    nothing to relay but the output.

  - **A zone that matches *some* products is not an answer.** Many products have
    zones that agree with each other, so a zone can match by coincidence. The
    probe only names a zone that matches every promoted product it checked, and
    says "all agree here, retry with another query" when more than one survives.
    Reporting a winner from a sample where the zones never disagreed would be
    the confident-and-wrong failure this repo has already paid for.

  - **A test of mine passed under mutation, which was the find.** It was called
    "a zone of 0 is not a match", and removing the zero check left all 19 tests
    green — because 0 can never equal a positive `now + save`, so the guard
    never fires. The safe numeric conversion around it *is* load-bearing:
    replacing it with a bare `float()` dies with `ValueError` on a non-numeric
    zone value. So the false claim went, the real guard stayed, and it now has
    a test that fails without it. That is twice in one day that a test passed
    for a different reason than its name gave.

  - **`git add -A` swept the probe into an unrelated commit, and gitleaks
    caught it.** The commit was meant to be a one-file journal note. The probe
    came with it and tripped `env-secret-assignment` on
    `KEY="${WOOLWORTHS_SEARCH_KEY:-}"`. Backed out, and the scanner did its job
    twice over — it flagged a real scope mistake as well as the rule match.

  - **That match is a genuine false positive, so it is marked on the line.** The
    rule's own description is "Secret-looking environment variable assigned a
    **literal** value"; this assigns an expansion. `WOOLWORTHS_SEARCH_KEY` is
    Constructor.io's public client key, served to every visitor in
    woolworths.co.za's own bundle. `.gitleaks.toml` was not widened. The comment
    has to sit on the finding's own line — a reason block above it does not
    suppress anything, which cost one run to discover.
