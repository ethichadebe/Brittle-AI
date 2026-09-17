# 2026-09-17 — Makro, written from what the page said

- **Asked for:** Makro as the fifth store.
- **Worked first time:** the scraper did, because the probing was finished
  first. Nine probe rounds preceded a single pass at the code.
- **Laptop needed:** yes, for every probe round; no for the scraper itself.
  Verification against the live app is still owed.
- **What the probe settled, so the code guessed nothing:**
  - Makro runs Flipkart's stack. Direct, no WAF, **no ScraperAPI credits** —
    unlike Checkers and Shoprite.
  - Results are embedded in `window.__INITIAL_STATE__`. There is no XHR endpoint
    to chase; `/api/N/page/fetch` returns 404 here.
  - 45 usable products in one request.
  - Two widget shapes: `value.title` in `renderableComponents`,
    `titles.title` in the `products` widget. Accepting only the first found 5
    of the 45.
  - Products sit at depth beyond 16. The walk goes to 40 because that is what
    the page needed, not because it felt safe.
- **Decisions taken, and why:**
  - **Products are found by shape, not by path.** Following one array path
    collects five; walking for objects carrying an id, a title and a pricing
    block collects all of them, and survives Flipkart rearranging its widgets.
  - **`finalPrice` is never read.** It is named "Total" with `priceType: TOTAL`
    and sits beside a `deliveryCharge` block, so on a product with delivery it
    may not be the shelf price. `prices[]` by `priceType` says what each number
    is: `SPECIAL_PRICE`, then `FSP`, then `mrp`.
  - **`loyaltyPrice` is always null.** Makro's "Special Price" is a public
    promotion, not card-gated, and Makro has no loyalty programme. The frontend
    applies `loyaltyPrice` only when a shopper enables loyalty for a store, and
    Settings lists only stores with a `loyaltyProgramme`, so mapping a public
    promotion there would both mislabel it and risk the wrong basket total. The
    effective price is quoted as `regularPrice` instead.
  - A product whose price cannot be read is **dropped**, not shown at zero.
- **Registered but `active: false`.** `active` is read only by the frontend, so
  `/api/search?store=makro` can be verified while the UI still shows coming
  soon. Prices want checking against the site before shoppers see them — the
  Woolworths zone question is still open for the same reason.
- **Traps recorded in the tests rather than in comments alone:** `currency` says
  `INR` on a rand price, `discountAmount` is in cents while `totalDiscount` is a
  percentage, and `balancedSlice` must not stop at a brace inside a string.
