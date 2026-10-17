# 2026-10-17 — Probe Dis-Chem's search service, Klevu

- **Asked for:** "lets build dischem" (#165), once the ScraperAPI credits had renewed and the key was rotated.
- **What the rerun of the first probe showed (from the VPS):**
  - **Direct:** Cloudflare's challenge.
  - **ScraperAPI standard (1 credit):** "Request failed", not charged.
  - **ScraperAPI premium (10 credits):** the search page. It names Klevu (search) and Magento.
  - At 10 credits a search, the free plan's 1,000 would last about 100 searches a month.
- **What changed:** `scripts/probe-dischem-klevu.mjs`, run once on the VPS, posts its answer to #165:
  1. Fetches the search page once through premium (10 credits). It reads Klevu's search host and the shop's public search key from it.
  2. Asks Klevu directly on both of its APIs (v2 `cs/v2/search`, v1 `n-search`). Klevu answers on its own servers, outside Dis-Chem's Cloudflare, so this costs nothing.
  3. Fetches one product picture directly, to see whether pictures are behind Cloudflare too.
  - It prints no keys, ScraperAPI's or Klevu's. It masks any long token in the snippet it shows around the Klevu settings, in case a key comes in a shape it doesn't recognise. It skips the paid step with fewer than 10 credits left, or under a lower `MAX_CREDITS`.
- **Worked first time:** mostly. `scripts/probe-dischem-klevu.test.mjs` runs it against stand-ins for ScraperAPI, the page, Klevu and a picture host.
  - The first test page put the live key first, so it couldn't show the probe skipping a stale one. The old key now comes first, as on real pages.
  - Switching off key redaction went unnoticed at first, because nothing printed a key. The Klevu stand-in now repeats the key it was sent in its errors, as an API may, and the same break fails six checks.
  - Every other deliberate break also failed the test:
    - no credit check;
    - no cap;
    - no fallback to Klevu's older API;
    - no masking;
    - a key pattern that also matches class names;
    - fields read from the first record only.
- **Laptop needed:** no.
- **Friction:** Dis-Chem is still unreachable from a cloud session, so its page is only ever seen through the VPS.
