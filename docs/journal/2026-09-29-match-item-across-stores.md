# 2026-09-29 — Matching a list item to another store, or refusing to

- **Asked for:** #89 — given a list item and a target Store, either return
  a Substitute with both products' Unit Prices, or refuse honestly. Last
  piece before the compare route itself (#90) can be built.
- **Worked first time:** yes, on the design that ended up in the PR — the
  main decision (below) was made before writing any code, not discovered
  by a failing test.
- **Laptop needed:** no.
- **Friction:**

  - **"Search the target store, via #76's cache" meant #76's caching logic
    had to stop being trapped inside a route handler.** `/search`'s cache
    check, hydrate-on-hit and populate-on-miss logic all lived inline in
    `routes/search.ts`, reachable only over HTTP. Pulled it out into
    `services/search.ts` as one importable `search(storeSlug, query)`,
    with the route now a two-line wrapper around it. `matchItem` calls the
    exact same function `/search` does, so a repeat comparison of the same
    list genuinely never re-scrapes — not "the same idea implemented
    twice", the same call.

  - **The matching algorithm's sophistication isn't actually what this
    issue tests.** #89's acceptance criteria are all about the Pack Size
    gate: parse it, refuse when it's unreadable, refuse when it's a
    different dimension. Picking a "plausible equivalent" among several
    candidates just needs to be *reasonable*, not clever — implemented as
    plain word-overlap scoring (`nameSimilarity`), tested on its own for
    picking the closer of two names, and left at that rather than reaching
    for anything more elaborate the issue didn't ask for.

  - **Mass and volume are not "different sizes", they're different
    dimensions — 500 g of one product and 2 L of another cannot be
    compared at all**, not even badly. Milk (sold by volume) and milk
    powder (sold by mass) is the realistic case this actually happens: the
    closest-named match. Every unmatched result carries a `reason` string
    that names *why* — pack size unreadable on the original, unreadable on
    the candidate, or the two units not being comparable — rather than one
    generic "no match" for all three, per the issue's own mutation-check
    requirement: removing the unit-compatibility check should make a
    mismatched-size test fail by naming the size, not just by picking a
    wrong Substitute silently.

  - **Pack Size parsing takes the rightmost number in the name on
    purpose.** A count earlier in the name ("Pack of 18 Coca-Cola Cans
    2L") is not the pack size; the trailing "2L" is. Tried the multiplier
    form (`6 x 1 L`) before the simple form on every parse, since the
    simple pattern would otherwise happily match just its trailing `1 L`
    and silently divide the true size by 6.

  - **No route for this yet, on purpose.** The issue is explicit that
    presenting a Substitute and computing a comparison total are separate,
    not-yet-filed issues — `matchItem` is a plain importable function with
    no HTTP surface, nothing to wire into `app.ts` yet.

  - **Next:** #90 (the compare route) can call `matchItem` once per list
    item against the chosen target store, now that both the Pack Size gate
    and the shared search cache exist. Also backend-only, same flag as
    #74/#75/#76 — nothing new to live-test on the phone yet.
