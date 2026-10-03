# 2026-10-03 — Checkers and Shoprite priced at a Joburg branch (#66)

- **Asked for:** fix the bug the location probe found. The app showed
  everyone one default store's Checkers and Shoprite prices: a Cape Town
  store for Checkers, and Shoprite's national default. The owner chose a
  Joburg branch as the default for anyone who hasn't shared a location.
- **Worked first time:** the tests passed once written. Partway through I
  changed the design: as first written, a slow branch lookup would have made
  some searches wait. Not yet seen on the live site; the next deploy shows
  it.
- **Laptop needed:** no.
- **Friction:**

  - **The cause:** the scrapers sent the branch in the search request's body
    only. The sites read it from the `storeContexts` cookie, which never went
    through ScraperAPI, so every search got the national default store.

  - **The fix:** the scrapers now find the branch themselves.
    - They look up the stores that serve Sandton (the same request the
      probe used) and send that branch as the cookie.
    - For Shoprite, which doesn't deliver in Sandton, they ask from each
      nearby Shoprite in turn, up to 25, and take the first that delivers.
      The probe found Sophiatown that way.
    - `CHECKERS_COOKIES` and `SHOPRITE_COOKIES` no longer choose the branch.
      They only matter for local development without ScraperAPI.

  - **Lookups don't slow searches down.**
    - Finding the Shoprite can take a dozen requests through ScraperAPI. A
      branch is kept for six hours.
    - When it expires, searches keep using it while a fresh lookup runs
      behind them. A failed refresh keeps the old branch and tries again
      within five minutes.
    - The first lookup starts when the server starts, so no shopper waits
      for it.
    - If a lookup fails outright, searches still run, at the site's default
      store, and are labelled "unconfigured" rather than claiming a branch.

  - **Price Zones change.** A Checkers or Shoprite zone is now a hash of the
    branch's store ids, no longer a hash of the pasted cookie.
    - Cached searches under the old zone stop matching, so the first search
      for each term after deploying scrapes fresh.
    - Checking the zone may now wait on that one lookup, so it became
      asynchronous. The database tests' mocked zone changed to match.

  - **The browser fallback** puts the same branch into its own cookie jar,
    so it prices the same store.

  - **Mutation-checked:** six breaks, each caught by the tests:
    - no branch cookie;
    - no nearest-delivering fallback;
    - not remembering the branch;
    - remembering failures for six hours;
    - making searches wait for a refresh;
    - dropping the branch when a refresh fails.

  - **Cost:** one Checkers lookup and up to about 27 Shoprite requests every
    six hours, each through ScraperAPI.
