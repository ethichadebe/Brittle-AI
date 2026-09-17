# 2026-09-17 — Makro had forty products all along

- **Asked for:** take the recommended option, which I had said was chasing
  Flipkart's XHR endpoint.
- **Worked first time:** no, and the recommendation itself was wrong.
- **Laptop needed:** no. Free, no credits.
- **The correction:** I reported that Makro's page held **five** products and
  recommended reverse-engineering an XHR endpoint to get a full result set. The
  page holds **forty**. The five came from reading the two top-scoring arrays,
  which are two widgets among many — Flipkart spreads results across widgets,
  and counting one of them is not counting the page. Step [4], added a round
  later precisely to count properly, says `productid 40 distinct`,
  `itemid 80 distinct`.
  - So the argument I made — that five results would make Makro read as *not
    stocking* an item — was sound reasoning from a number I had not checked.
    The reasoning was fine; the input was wrong, and I acted on it.
  - `[7]` also answered: all four `/api/N/page/fetch` paths return 404 HTML, the
    same 3887-byte error page the Shoprite endpoint got. Those endpoints do not
    exist here. That would have been a confusing dead end had the premise been
    right.
- **Friction:**
  - The XHR step is gone, replaced by a **parser simulation**. It walks the page
    finding objects that carry an id, a title and a pricing block, exactly as the
    scraper will, and reports how many are usable and what their prices look
    like. On the fixture: 40 usable, 24 with a special price, and sample lines
    reading `R215.0 was R300.0`.
  - Finding products **by shape rather than by path** is the design decision that
    falls out of this. Following one array path would have collected five;
    walking for objects that look like products collects all forty regardless of
    how Flipkart arranges its widgets, and survives the arrangement changing.
- **Makro is now fully characterised:** direct, no WAF, no credits, forty
  products per search, `value.title` / `value.productId` / `value.imageUrl`, and
  `prices[]` read by `priceType` — `FSP` regular, `SPECIAL_PRICE` promotional —
  avoiding `finalPrice`, which is a TOTAL beside a delivery charge. Nothing left
  to probe.
