# 2026-10-03 — Probe: can Pick n Pay be asked for one store with plain requests? (#132)

- **Asked for:** #132. Pick n Pay should be priced at a real store, with a
  Joburg default, as #130 did for Checkers and Shoprite. The issue said to
  ask the live site first.
- **Worked first time:** the probe's offline test passed first time. I then
  broke the probe three ways on purpose, and the test caught each one. Not
  yet run live.
- **Laptop needed:** no.
- **Friction:**

  - **Constructor isn't the site's search.** The owner's recording shows
    pnp.co.za using Constructor (`ac.cnstrc.com`), which today's scraper
    calls, only for autocomplete and tracking. The results come from the
    site's own `products/search?storeCode=`. So the scraper has to move
    there, rather than pass a store to Constructor.

  - **The open question.** On #66 that search was only ever reached from
    inside a browser. The scrapers send plain requests.
    `scripts/probe-pnp-store-search.mjs` walks the site's chain (cart,
    Sandton address, the store it's given, search at that store) two ways:
    straight to pnp.co.za, and through ScraperAPI. It prints which works.
    - It also searches the same thing at the cart's default store, to prove
      the store code changes prices.
    - It prints one product exactly as sent (price, pictures, promotions),
      so the new parser, including Smart Shopper prices, is written against
      the real shape rather than a guess.

  - **The stand-ins** are a Pick n Pay that prices by store code and can
    refuse plain requests the way a firewall would, and a ScraperAPI. Their
    products and prices are made up.

  - **The live run answered (#132):** plain requests straight to
    pnp.co.za work, so there's no ScraperAPI and no credits for Pick n Pay.
    - Sandton's cart is given Benmore (GC13). 10 of the 18 milks seen at
      both Benmore and Constantia (WC21) are priced differently.
    - The Smart Shopper price arrives as a promotion whose text is a bare
      price ("R89.99 "), marked `valid: false` even while it runs, so its
      dates decide instead.

  - **The scraper now uses the site's own search,** at the store the cart
    gives Sandton, remembered like Checkers' and Shoprite's.
    - That remembering moved into `remember.ts`, shared by all three. The
      31 Checkers/Shoprite tests passed unchanged.
    - Multi-buys ("2 for R50") are not read as a card price, because they
      are what a basket costs, not one unit (CONTEXT.md).
    - The larger "product" picture is used, not the 96px thumbnail.
    - Pick n Pay prices are now read for its own store only.

  - **Product ids carry over.** Before switching, the live database was
    asked for some saved Pick n Pay ids. They are the same codes the new
    search returns (`000000000001027180_EA`), so items already on lists
    keep finding their prices, and no conversion is needed.

  - **Mutation-checked:** dropping the store code, reading any text as a
    card price, using the thumbnail, and ignoring promotion dates were each
    caught by the tests.
