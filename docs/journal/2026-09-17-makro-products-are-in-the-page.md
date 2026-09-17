# 2026-09-17 — Makro's products are in the page, under the analytics

- **Asked for:** find where Makro keeps its products.
- **Worked first time:** the ranking fix did. Reading the result needed one more
  pass, because the fields that matter were buried.
- **Laptop needed:** no. Free — Makro answers directly, no credits.
- **Friction:**
  - Ranking by product-likeness found the right arrays immediately: two scoring
    7, at `widget.data.renderableComponents` and `widget.data.products`, against
    a 20-item notification-channel config scoring 3. The old size ranking would
    have put the config first again.
  - The field lists were then unreadable. A Flipkart product carries far more
    analytics than substance — `action.constraints`,
    `action.customTrackingEvents`, `action.omnitureData`,
    `action.requiredPermissionType`, `addToWishlist.action.*` — and twelve of
    those crowded out every real field. The probe was reporting honestly and
    still showing nothing useful.
  - Step [5] prints the best array's first item with **values**, analytics
    filtered out. That turns a list of paths into the parser's mapping:
    `value.pid`, `titles.title`, `images[0].url`, `finalPrice.value`,
    `pricing.mrp`, `pricing.totalDiscount`.
  - A false positive in the price matcher: `sav` matched
    `enableAddNewCardOnSavedCardsSection`, so a payments config key was reported
    as a price field. Widened to `saving`. Short substrings are cheap to write
    and keep costing more than they save — this is the third keyword-matching
    bug in two days, after `ac.cnstrc.com` being too specific and `value`
    matching everything.
  - **`value.pricing.finalPrice.value` exists**, which settles the question step
    [4] was added to answer: the products are in the HTML, and there is no need
    to reverse-engineer Flipkart's XHR endpoint.
- **Still open before a scraper:** the page holds only four or five products per
  widget, and a search for milk returns far more than that. Whether the rest
  arrive by XHR, or the page simply embeds several widgets' worth, decides
  whether this is a one-request scraper or a paginated one.
