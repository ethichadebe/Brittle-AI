# 2026-09-17 — Makro's product fields were under its reviews

- **Asked for:** read Makro's product fields off the live page.
- **Worked first time:** no. Hiding the analytics revealed a second layer of
  noise underneath it.
- **Laptop needed:** no. Free — no credits.
- **Friction:**
  - With `action.*` analytics filtered, step [5] finally printed values — of a
    **reviews widget**. `mostHelpful.author`, `mostRecent.text`, `Worth
    spending`, a reviewer's name. Each product carries two full review objects
    that are bulkier than the product, and at sixteen fields shown they crowded
    out the title and the price exactly as the analytics had.
  - Reviews and ratings are in the noise list now. The deeper fix is ordering:
    fields were printed in **insertion order**, which is an arbitrary reason to
    choose what a human sees first. They are ranked by what a parser needs —
    price, then title, then image, then id — so the answer appears at the top
    whatever the page nests around it.
  - That is the same mistake as ranking arrays by size, one level down: an
    incidental property of the data standing in for relevance. Worth naming,
    because it has now cost two rounds in the same script.
  - A real finding did surface through the noise: `value.imageUrl` is
    `https://www.makro.co.za/...`, **not** flixcart. Makro serves its own
    product images despite running Flipkart's stack, so the image-proxy
    allowlist will need `makro.co.za` rather than `flixcart.com` — and
    `imageProxy.test.ts` would have caught that at switch-on either way.
- **Still open before a scraper:** the widgets hold four or five items each and
  a milk search returns far more. Whether the page embeds several widgets' worth
  or the rest arrive by XHR still decides one request against pagination.
