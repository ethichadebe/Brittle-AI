# 2026-09-17 — Going after the rest of Makro's results

- **Asked for:** take the recommended option. I had offered two and named
  neither, so the recommendation came first: go after the XHR endpoint rather
  than ship a five-product Makro.
- **Worked first time:** the probe step did. Whether Makro answers is still
  unknown — that is what running it settles.
- **Laptop needed:** no. Free, no credits.
- **Why the endpoint rather than five products:** a price comparison showing
  five Makro results is not merely thin. If the shopper's item is not among
  those five, Makro reads as *not stocking it* when it does, next to four stores
  returning twenty. That is a wrong answer rather than a small one, and wrong
  answers are the thing this app exists to avoid.
- **Friction:**
  - Step [7] asks `/api/N/page/fetch` for N in 4, 3, 2, 1, because the page's
    own HTML references `/api/payments/1/page/fetch` and that is Flipkart's
    page-fetch family. The **request body is a guess** —
    `{"pageUri": "/search?q=...", "pageContext": {}}` — and the step says so:
    a 400 means the guess was wrong, not that the endpoint is.
  - That distinction is deliberate. Four stores in, the pattern is that a
    negative result usually means the probe asked badly, not that the store is
    unscrapeable. SPAR was the one genuine no, and it looked nothing like this.
  - When nothing answers, the output says to copy one real request out of
    DevTools instead of guessing again. Guessing a second body shape would cost
    another round trip and teach nothing; a captured request ends the question.
  - Tested both ways on stubs: a 200 with twenty ids reports where the rest
    live, and four 400s report that the body is wrong and what to do about it.
- **Still true:** everything else about Makro is known — `value.title`,
  `value.productId`, `value.imageUrl`, `prices[]` by `priceType`, and the three
  units the pricing block mixes. Only the result count is open.
