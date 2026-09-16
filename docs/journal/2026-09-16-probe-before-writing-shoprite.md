# 2026-09-16 — Ask Shoprite before writing its scraper

- **Asked for:** add a Shoprite scraper, reusing or centralising the Checkers logic since the two sites look identical.
- **Worked first time:** no code yet, deliberately. Checkers and Shoprite are both Shoprite Holdings and almost certainly the same platform, but "almost certainly" is how the last four months of this project were lost. This session cannot reach shoprite.co.za, so the endpoint gets asked rather than assumed.
- **Laptop needed:** yes for the probe; the VPS is the only machine here that can reach either store.
- **Friction:**
  - The interesting question is not whether Shoprite has a catalogue API, it is whether its response has the same field names. `normalise()` reads `id`, `name`, `imageProductCardURL`/`imageURL`, `price` and `bonusBuy.discountValue`. If those are present, both stores are one scraper differing only by base URL and cookie. If they are not, Shoprite needs its own parser and centralising would be the wrong shape.
  - The probe asks Checkers as well as Shoprite, so a failure can be read: if both fail the run is wrong, if only Shoprite fails the answer is about Shoprite.
  - `storeContexts` is per-retailer. Checkers' value names Checkers stores, so it cannot work for Shoprite even on an identical platform. The probe sends an empty one first: products back means the endpoint defaults sensibly, zero products with HTTP 200 means the endpoint is right and wants a Shoprite value, and a 404 or HTML means a different platform.
  - `shoprite` is not in the `StoreSlug` union or `STORE_CONFIGS`, so it needs adding in `packages/types` before any scraper can be registered. Worth noting that Shoprite's loyalty programme is Xtra Savings, the same as Checkers, which fits the shared-platform theory.
