# 2026-10-03 — Do prices change with location? A probe (#66)

- **Asked for:** whether store prices depend on where the shopper is, and if
  so, use location permission to show each shopper their own prices.
  Grilled on #66: measure first; ask permission and pick the nearest branch
  per store, keeping only the branch and never the coordinates; each list
  remembers its branch and can be changed; hand-check two places, then probe
  all nine provinces.
- **Worked first time:** the probe's offline test passed after two fixes.
  One expectation was miscounted. The other fix stripped Playwright's
  `page.evaluate: Error:` prefix from error lines.
- **Laptop needed:** yes, for the hand check. The owner recorded Sandton and
  Sea Point on each store site, then exported the browser's network log
  (HAR) so the requests could be read. The recordings stay out of the repo:
  they hold session cookies and the repo is public.
- **Friction:**

  - **The hand check: prices do change with location.**
    - **Pick n Pay:** eggs differ by R5 to R15 between Sandton and Sea
      Point, and bread by R1. Without an address, the site prices from a
      default store (Constantia in the recording), which is probably what
      the app shows everyone today.
    - **Checkers:** prices differ, and so do the range and the promotions.
      Each place stocked a different egg brand, and Oros was on promotion in
      one place only. `CONTEXT.md` said a zone changes the price but not the
      range; that is now corrected.
    - **Shoprite:** delivers to Soweto but not to some Cape Town addresses.
    - **Woolworths:** the same prices at both addresses, so inconclusive.
    - **Makro:** the same everywhere.

  - **How each store turns a place into a branch.** The recordings showed
    this, and it is now written at the top of
    `scripts/probe-location-prices.mjs`.
    - **Checkers and Shoprite:** coordinates go in and store contexts come
      out. The search carries those contexts.
    - **Pick n Pay:** coordinates go onto an anonymous cart, the cart is
      given a store code, and the search takes that code.
    - **Woolworths:** needs a Google place id rather than coordinates, so it
      is left out of the probe for now.

  - **Built the fixture first.** `scripts/probe-location-prices.test.mjs`
    runs the probe against three local stand-ins that price each product by
    the branch the request names.
    - **Mutation-checked three ways,** and the test failed each time: the
      search dropping the branch, Pick n Pay searching its default store,
      and Checkers' old price read as rands rather than cents.
    - **Not in CI,** like `probe-game.test.mjs`, because it needs Chromium.

  - **Cost.** Checkers and Shoprite go through the ScraperAPI proxy, as the
    scrapers do. A full run (nine places, three stores, three searches)
    spends a few hundred credits. `STORES`, `QUERIES` and `PLACES` narrow it.

  - **Next:** run the probe on the VPS; it posts its output to #66. The
    results decide how the location feature is designed.
