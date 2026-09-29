# 2026-09-29 — Unblocking compare, and nearly deleting real coverage doing it

- **Asked for:** #74 — let a test substitute the scraper registry, the
  first of the issues actually blocking the compare feature. Every prior
  issue this session touched accounts; this is the first return to the
  product-cache/compare chain since it was only ever specified, not built.
- **Worked first time:** no. The design was right; the file it landed in
  was not new, and I wrote over it without reading it first.
- **Laptop needed:** no.
- **Friction:**

  - **The fix is a factory, not a flag.** The obvious minimal change is a
    setter — `setScraperForTesting(store, fake)` — but that leaves the
    per-store serial queue as module-level state shared between whatever
    test runs next, which is exactly the kind of thing #74's own acceptance
    criteria asks to prove ("concurrent calls for one store do not
    overlap"). Made `createSearchEngine(registry)` return a fresh
    `searchProducts` bound to its own queue, so a test engine is fully
    isolated — and proved it: two engines given the same store name run
    concurrently rather than serialising against each other, which would
    only happen if their queues were actually separate.

  - **`backend/src/scraper/engine.test.ts` already existed, and I overwrote
    it.** `git status` showed it as `M`, not `??`, and I only noticed
    because the full-suite count read 87 where I expected 89-plus-new. The
    original file used `vi.mock` to verify the production registry's real
    behaviour: dispatch to the correct scraper for Checkers, Shoprite and
    PnP, the Playwright fallback firing on each of their failures, and the
    "no fallback available" path logging and returning empty. None of that
    is what #74 is about, and none of it was superseded by what I wrote —
    it would simply have been gone, silently, from a PR whose whole point
    is adding test coverage.

  - **Fixed by merging, not choosing.** The two files test different
    things and both need to exist: the original exercises the production
    `searchProducts` singleton against the real scraper classes via
    `vi.mock`; the new tests exercise `createSearchEngine` directly with a
    fake, proving the substitution and queue-isolation properties `vi.mock`
    cannot reach into. Recombined them in one file — 8 original cases, 6
    new — and reran the count: 95, an addition, not a swap.

  - **The concurrency test needed a scraper that could prove overlap, not
    just avoid it.** A fake that resolves instantly can't distinguish
    "serialised" from "coincidentally fast" — added a small delay and a
    high-water-mark counter so the test asserts `maxConcurrent === 1`
    directly.

  - **One eslint catch, unrelated to the near-miss above:** an unused
    `_query` parameter on the fake scraper failed lint even with the
    underscore — this repo's `no-unused-vars` config uses
    `args: "after-used"` with no ignore pattern, which only exempts an
    unused parameter that comes *before* a used one, not the last (or only)
    parameter in the list. Removed the parameter entirely; TypeScript
    allows implementing an interface method with fewer parameters than its
    signature declares.

  - **Next:** #75 (Price Zone in the price cache key) and #76 (serve
    repeat searches from cache) are what #89 (matching across stores) and
    therefore compare itself are actually waiting on. Reading every file
    before touching it, this time, not assuming a name is unclaimed.
