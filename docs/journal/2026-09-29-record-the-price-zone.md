# 2026-09-29 — Recording the Price Zone on every cached price

- **Asked for:** #75 — every price the scrapers write to `price_cache` (and
  every `Product` a search returns) now carries the Price Zone it was
  actually observed in, per ADR 0001. Second of the three issues blocking
  the compare feature, after #74.
- **Worked first time:** mostly. The scraper-side design (below) held up
  first try; the design question at the end took the longest.
- **Laptop needed:** no.
- **Friction:**

  - **Where each store's zone actually lives differs per scraper, and that
    shaped where the write happens.** Woolworths' zone genuinely varies
    *per product* — its existing price-fallback loop already walks
    `p10 → p30 → p60` and stops at the first one with a real price, so
    `zoneUsed()` mirrors that exact loop and is called from inside
    `normalise()`. Checkers/Shoprite's zone is a whole-*request* property (a
    branch cookie), so it's computed once in `search()` — via
    `opaqueZone()`, a `sha256(cookie).slice(0, 12)` hash, never the cookie
    itself, since the cookie carries a session token — and stamped onto
    every result afterwards, keeping `normalise()` a pure function of the
    response body so its existing exact-equality tests didn't need
    touching. Makro and PnP get a constant: `NO_ZONE` for Makro (checked
    against the live site), and `NO_ZONE` for PnP too, but flagged
    honestly in a comment as *assumed*, not verified — no zone-carrying
    field has ever been seen in PnP's response, unlike Woolworths where it
    was confirmed. The Playwright fallback path can't see Checkers/
    Shoprite's live cookie from inside `parse()`, so it gets an honestly-
    labelled `defaultZone` per strategy (`unconfigured` for the
    Shoprite-group fallback, `none` for PnP's) rather than threading the
    real value through a bot-evasion-hardened code path that didn't need
    touching for anything else.

  - **The open design question: what zone does an item-add write, when
    there's no scraper result to draw one from?** `POST /lists/:id/items`
    never re-scrapes — it trusts the price the client already has from a
    `/search` result the shopper picked. It was already trusting that
    result's price and image; the zone that price came from is no
    different, so the client now relays the `zone` field from the
    `Product` it searched (not a value it invents) and the route forwards
    it to `upsertCache` unchanged. `zone` isn't added to `ListItem` itself
    — it's a snapshot value used only to key the cache row, not something
    the list needs to remember about its own item.

  - **The cache key had to grow without a default.** `price_cache`'s
    primary key changed from `(storeSlug, productId)` to `(storeSlug,
    productId, zone)`, and Postgres won't add a `NOT NULL` column with no
    default to a non-empty table. Rather than invent a backfilled zone for
    rows that predate the concept, the migration truncates the table
    first — it's a pure TTL cache with nothing else pointing at it, so the
    next read for each product is just an ordinary cache miss.

  - **Proving the key actually matters.** Added a mutation-shaped test:
    scrape the same product in two different zones and assert `upsertCache`
    is called twice with two different zone values in `where`, rather than
    once. Collapsing the key back to `(storeSlug, productId)` — the bug
    this issue exists to prevent — makes it fail by upserting the same row
    for both zones.

  - **Next:** #76 (serve repeat searches from cache) can now trust a cache
    row's zone actually matches what it would scrape live. Both #74 and
    #75 are backend-only with no new UI surface to live-test, which the
    user will need to weigh in on before I move past #76 to the compare
    route itself (#89/#90), given the established rule of confirming each
    buildable increment before starting the next.
