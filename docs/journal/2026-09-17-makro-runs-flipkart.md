# 2026-09-17 — Makro runs Flipkart, and is free to scrape

- **Asked for:** probe Makro as the fifth store.
- **Worked first time:** no — three probe bugs had to be fixed first. The clean
  run then answered in one go.
- **Laptop needed:** no.
- **Friction:**
  - **A correction I had told the user twice:** Makro is *not* behind a WAF. The
    clean run reports `via direct`, `WAF: no sign of one`, `credits spent: 0`.
    The earlier "Makro has a WAF, so every search costs a credit" came from the
    same `captcha` false positive: its 2.5MB homepage tripped the body scan, the
    direct fetch looked refused, the proxy engaged, and the probe reported a WAF
    that does not exist. That wrong conclusion was used to argue Food Lover's
    Market might be the better fifth store, so it changed a recommendation, not
    just a line of output. Corrected on the merged pull request rather than
    edited away.
  - **Makro runs Flipkart's commerce stack.** The page references
    `flipkart.com`, `connekt.flipkart.net` and `img1a/img5a/img6a.flixcart.com`,
    and its paths are Flipkart's: `/fashion-search-voice`, `/image-search`,
    `/api/payments/1/page/fetch`. Walmart owns both Flipkart and, through
    Massmart, Makro. Not a platform anyone would have guessed from the storefront.
  - The generic probe reported `platforms named: none recognised` while listing
    three flixcart hosts directly beneath it — the same false negative shape as
    Woolworths' `cnstrc.com`, and for the same reason: the fingerprint list did
    not contain the platform. `flipkart`, `flixcart` and `useinsider` are in it
    now. The host list keeps saving the fingerprint list, which suggests the
    hosts are the more reliable signal of the two.
  - `probe-makro.sh` asks the one question left: where the products live. It
    finds every array of objects in the page's embedded JSON, ranks them by
    size, and prints **dotted leaf paths** rather than top-level keys. On the
    fixture the wrapper object's only key is `productInfo`, which tells a parser
    nothing; what it needs is
    `productInfo.value.pricing.finalPrice.value`.
  - Two bugs in that reporting, both found by running it against a fixture:
    paths were wrapped as space-joined text and split mid-token, and the
    price-ish filter matched **every** field because Makro nests everything
    under `productInfo.value` and "value" was in the word list. Paths now print
    one per line, and the price match looks at the last two segments only.
- **Next:** run `probe-makro.sh` against the live site and read the field paths.
