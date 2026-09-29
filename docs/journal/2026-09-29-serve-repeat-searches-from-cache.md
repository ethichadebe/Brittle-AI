# 2026-09-29 — Serving repeat searches from cache

- **Asked for:** #76 — a repeat `/search` is answered from the database
  instead of scraping again. Last of the three issues directly blocking
  compare; #89 (matching a list item across stores) can start once this
  merges.
- **Worked first time:** mostly. The chicken-and-egg problem below took a
  few tries to see clearly; once seen, the fix was small.
- **Laptop needed:** no.
- **Friction:**

  - **You can't look up a cache keyed by zone without already knowing the
    zone, and knowing the zone used to require scraping.** `search_cache`
    is keyed on `(storeSlug, zone, query)` per the issue, but the only zone
    value that existed before this was `Product.zone` — something a
    scraper only produces *after* it has already run. That's backwards:
    the whole point is deciding whether to scrape at all. Added
    `currentZone(): string` to the `Scraper` interface — a value every
    scraper can already state without a network call, because it's the
    same configuration each one's `search()` already reads: Checkers/
    Shoprite hash their cookie env var, Woolworths reports its preferred
    zone order's first entry, Makro/PnP report the constant `none`. Wired
    through `createSearchEngine` as a sibling to `searchProducts`, so
    `/search` can check the cache before touching a scraper at all.

  - **Reconstructing a cached search needed a field price_cache never had.**
    A hit rebuilds full `Product`s from the ordered ids `search_cache`
    stored, by reading `price_cache` — which stays the single source of
    price per the issue. But price_cache never stored `imageUrl`, because
    nothing needed it there before (list items keep their own copy).
    Added it, alongside `zone` from #75, rather than inventing a second
    place to read images from.

  - **Indicative Price is a different clock from price_cache's own TTL,
    and conflating them would have defeated the whole feature.**
    `price_cache`'s existing one-hour freshness check is for the *Basket
    Price* (refreshed when a list is opened) — CONTEXT.md already names
    the Indicative Price a search shows as good for a whole day. Serving a
    search hit reads `price_cache` rows unconditionally, never gating them
    on that shorter TTL: the 24-hour check that decided this was a hit at
    all is the one doing the promising, same as the language says.

  - **An empty result isn't cached.** A no-match query still needs
    *something* keyed for it to be a well-formed row, but a zero-product
    result carries no zone information to key it by honestly (there's no
    product to read a `.zone` off), and search_cache's own `zone` column
    is the request-level `currentZone()`, not a per-product value, so this
    isn't actually blocked the way it first looked. Decided to just not
    cache the empty case rather than reach further: a typo or genuine
    no-match query is cheap to re-scrape, and every acceptance criterion
    is about a *hit* behaving correctly, not about avoiding a second
    scrape of nothing.

  - **Proving the two things that must never merge.** One test scrapes the
    same query in two different zones and asserts two separate rows (not
    one overwritten); another does the same across two stores. Both are
    written to fail by *naming* the missing dimension if the key ever
    collapses back to just the query, per the issue's own mutation-check
    requirement — the same pattern #75's price_cache key test used.

  - **No test file existed for `search.ts` before this** — the route had
    no database dependency until now. Added `search.db.test.ts`,
    mirroring `listItems.db.test.ts`'s style: `vi.mock` on
    `scraper/engine.js` for both `searchProducts` and `currentZone`, a
    real Postgres test database for the cache tables. Zero network access
    and zero ScraperAPI credits anywhere in the suite, per the issue's own
    acceptance criterion — nothing here can reach a live store even by
    accident.

  - **Next:** #89 (matching a list item across stores) can now assume a
    repeat search doesn't cost a scrape, and that a `Product`'s `zone`
    reliably names where its price came from. Backend-only again, so
    nothing new to live-test on the phone — same flag as #74/#75.
