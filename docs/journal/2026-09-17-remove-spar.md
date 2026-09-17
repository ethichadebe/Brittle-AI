# 2026-09-17 — SPAR removed: there is nothing to scrape

- **Asked for:** remove SPAR from the application entirely, since a store with
  no online catalogue is futile to carry.
- **Worked first time:** yes. The removal was clean because nothing depended on
  it having existed.
- **Laptop needed:** no.
- **Friction:**
  - SPAR was not "not done yet", it was **not doable**. `spar.co.za` is a
    marketing site: a megabyte of HTML, a dozen ad and analytics trackers, and
    exactly one API path — `/api/stores/search`, a store locator. Confirmed
    twice, by probe and by browsing. SPAR SA is federated and does not sell from
    a national catalogue. Recorded in issue #33, closed `wontfix`.
  - A permanent "coming soon" card promises something that cannot arrive, which
    is worse than the store simply not being listed.
  - The removal touched three files and no database. `storeSlug` is a plain
    `String` in Prisma with no enum and no foreign key, and SPAR was never
    `active`, so the frontend blocked the click and no list can reference it.
    Nothing to migrate.
  - `engine.test.ts` needed repointing for the **third** time. Its "unsupported
    store" assertion named `woolworths` until Woolworths got a scraper, then
    `spar` until SPAR was removed. Naming a real store was the mistake: the
    behaviour under test is "a slug the registry does not know returns an empty
    list", so it now uses an invented slug cast to `StoreSlug`. It tests the
    same guard and cannot go stale the next time a store is added or dropped.
  - Backend route tests could not be run — no Postgres in this session, and they
    fail with `P1001 Can't reach database server`. The 38 tests that need no
    database all pass. Nothing here touches a route.
- **Left in place:** `makro` and `game` are still declared and inactive. Unlike
  SPAR, both sell online, and Makro is the next store — issue #35.
