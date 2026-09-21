# 2026-09-21 — The first live run, and what it cost #28

- **Asked for:** run the Woolworths promo probe to settle #27 and #28.
- **Worked first time:** the probe did. The *method* behind #27 may not work at
  all, and #28's premise turned out to be wrong.
- **Laptop needed:** no — one command on the VPS, output read from a paste.
- **Friction:**

  - **#27 is unresolved, and the probe was right to say so.** 40 products, 3
    promoted with `Now R … Save R …`, and all three zones matched all three
    products. The all-or-nothing rule refused to name a winner, which is the
    behaviour it was built for: a zone matching some products is a coincidence
    of products whose zones happen to agree.

  - **But "retry with another query" may have been the wrong advice.** The
    original Woolworths probe recorded `zones disagree: 12/20` on a milk
    search, so the catalogue *is* zone-priced — yet the promoted subset agreed
    perfectly. If promotions are priced nationally while base prices are
    regional, `Now+Save` can never separate the zones, however many queries
    anyone tries. That is a hypothesis, not a finding, and the honest response
    is to measure it rather than keep retrying: the probe now reports the zone
    spread among promoted products against the zone spread across the whole
    response, and says plainly which of the two situations it is in.

  - **#28's premise is falsified.** It assumed `product_promo_info` was "the
    likelier structured home" for the promotional price that `woolworths.ts`
    currently parses out of marketing copy. It is not a price field at all. It
    is multi-buy promotion metadata:

    ```
    prd_promo_typ   Multi
    prd_promo_qty   3
    prd_promomsg    Buy any 3 for R66 Yoghurt Corner Pots
    prd_promo_id    promo13990006
    bulk            false
    loyalty         false
    ```

  - **The two promotion mechanisms are disjoint sets.** 4 products carried
    `product_promo_info`; 3 carried `Now R` in their promo copy; and `[5]`
    reported no `Now R` to compare against, meaning *none* of the four
    `product_promo_info` products had `Now R` copy. So reading the loyalty
    price out of `product_promo_info` instead of the copy, as #28 proposes,
    would lose every straight discount and gain only multi-buys.

  - **There is still a lead in there, and it is the `loyalty` flag.** It reads
    `false` on the promos seen. If some promo carries `true`, that is a
    structural way to identify a WRewards deal, which is what #28 actually
    wants. The probe printed one sample value per path and so could not answer
    it — it now prints every distinct value, so one more run says whether
    `true` ever occurs.

  - **The live output corrected a fixture I had invented.** It printed
    lowercase `false`, and a JSON boolean would render through Python as
    `False`. So Woolworths sends these as strings. My first test fixture used
    real booleans and asserted the wrong casing; the fixture now matches the
    shape the box actually returned. Small, but it is exactly the class of
    thing that shipped `node.imageUrl` on Makro.

  - **Multi-buy savings are invisible to the app.** `woolworths.ts`'s
    `NOW_PRICE` regex cannot match "Buy any 3 for R66", so `loyaltyPrice`
    stays `null` — which is the safe degradation the file documents, not a
    bug. But it means a real saving is never shown. Raised, not fixed: it is a
    product decision about how to display a conditional price, not a parser
    change.
