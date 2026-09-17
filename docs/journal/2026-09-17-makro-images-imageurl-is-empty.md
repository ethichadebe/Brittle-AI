# 2026-09-17 — Makro's images were never at imageUrl

- **Asked for:** "I've tested Makro and the search doesn't return images."
- **Worked first time:** no, and this one is squarely my fault — the scraper
  shipped with a field that does not exist.
- **Laptop needed:** no.
- **Friction:**
  - **What the live check said.** One command printed the first Makro product's
    `imageUrl`, then asked the proxy and the origin about it separately. The
    field was **empty**; the proxy returned 400 because the `url` parameter was
    blank, and the direct fetch returned `000` because there was no URL to
    fetch. So the image-proxy allowlist was never involved. `makro.ts` reads
    `node.imageUrl` and Makro's product nodes do not carry one.
  - **How it got shipped.** PR #49's commit message said the image host was
    `makro.co.za` "because the probe printed the real image URLs rather than
    letting the platform imply the host". It did not. `probe-makro.sh` showed
    the first product's values with numerics first, which would have pushed a
    long URL out of the frame, and the test fixtures in `makro.test.ts` are
    hand-written — `https://www.makro.co.za/parmalat.jpg`, a URL I invented
    that reads exactly like one I had observed. Nine rounds of probing went
    into the price, and none into the image, but the commit message claimed
    otherwise with equal confidence. Same failure as the `totalDiscount`
    fabrication earlier the same day: a plausible fixture, believed.
  - **Not fixed by guessing.** Flipkart normally serves images from
    `rukminim*.flixcart.com` with `{@width}/{@height}/{@quality}` placeholders
    baked into the URL, and that would need both a different allowlist entry
    and a rewrite before the URL resolves. That is a good hypothesis and it is
    still a hypothesis, so `scripts/probe-makro-images.sh` goes first: it finds
    product-shaped nodes the way `makro.ts` does, walks each one for strings
    that look like images, and reports the **paths**, the **hosts** and whether
    any value carries a template placeholder. Key names are never guessed.
  - **The fixtures are declared invented, in the test file itself.** They prove
    the probe reports an image at a path nobody told it about — nested under
    `media.assets[0].src`, on a third-party host, with placeholders intact —
    and that it says `NONE in any product` plainly when there is no image. They
    do not claim Makro's real shape. Writing that distinction down is the
    cheapest guard against repeating exactly what happened here.
  - **Three mutations, each caught:** drop the file-extension evidence and the
    real path goes unreported (the leaf key is `src`, which no key-name hint
    matches); limit the scan to depth 1 and the same; remove placeholder
    detection and the `{@width}` trap goes unflagged. Output measured at 38
    columns, under the 40-column phone limit rather than assumed to be.
  - **Also seen, not fixed here.** Searching Makro for "Eggs" returns six
    plastic egg *containers* at R123–R298 and no eggs. Makro is a general
    merchandiser and has no food filter, the way Woolworths needed `isFood()`
    on `prodtype`. Images are the reported bug; this is a separate one and is
    raised rather than folded in.
