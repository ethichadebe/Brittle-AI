# 2026-09-21 — The zone was p10, and it had been wrong since launch

- **Asked for:** settle #27 and #28.
- **Worked first time:** the by-hand check did. Getting to a method that could
  work took three probe runs and one abandoned approach.
- **Laptop needed:** no. A phone, the signed-out site, and one price.
- **Friction:**

  - **#27 is settled: an anonymous visitor is shown p10.** The probe's
    shortlist named "Fresh Full Cream Ayrshire Milk 2 L" at p10 45.99, p30
    39.99, p60 39.99. woolworths.co.za signed out displayed **R45.99**. Exact
    product, exact number, no interpretation required.

  - **The default was p60, so the app had been quoting the wrong price since
    Woolworths went live.** R39.99 where the shopper pays R45.99 — R6 under on
    that one item, on roughly a third of a milk search (14 of 40 products
    differ by zone). Nothing looked broken, which is the failure mode this
    project keeps paying for.

  - **`stores.ts` predicted this exactly and was left in place to be checked
    against.** Its comment said: *"If #27 lands on a different zone, every
    Woolworths price shown until then was wrong by that zone's difference."* It
    did. The comment is now rewritten to record that it was right rather than
    quietly replaced, because a prediction that held is worth more to the next
    reader than a tidy file.

  - **The method that settled it was not the method this was built around.**
    The probe's arithmetic shortcut — `Now R<x> Save R<y>`, where x + y is the
    regular price — could never have worked: promoted products never differ by
    zone (0/3) while 14/40 others do, so promotions are priced nationally and
    base prices regionally. Two runs and a diagnostic established that, and the
    third run handed over a shortlist for the by-hand check the issue had
    proposed in the first place. The shortcut was worth trying; not noticing it
    was dead would have cost far more.

  - **One observation, one location.** If Woolworths geolocates by IP even for
    signed-out visitors, p10 is this region rather than a global default. That
    is #66's question. Either way p10 beats p60 for a South African shopper,
    and the zone stays configurable — said so in the code rather than claiming
    more than one data point supports.

  - **#28's pairing is confirmed, on the same run.** "Salted Butter 500 g"
    carried two promos with the same `prd_promo_id`, the same quantity and the
    same type, differing only in the flag and the price:

    ```
    promo[0]  loyalty: true   MyDifference: Buy 2 For R160
    promo[1]  loyalty: false  Buy 2 for R170
    ```

    So `product_promo_info[].loyalty` is a real discriminator for a card-gated
    price. This was only visible because the promos are now printed grouped by
    product — the aggregated view showed `loyalty: false | true` and both
    prices without pairing them, and concluding the pairing from that would
    have been inference presented as observation.

  - **Not fixed here, and it needs its own issue.** Both promos are
    conditional: "Buy 2 for R160" is not a unit price, and `Product.loyaltyPrice`
    is a single number per product. The model cannot express "R80 each if you
    buy 2". Wiring `loyalty` into the parser without deciding how to display a
    conditional price would put a number on screen that the shopper cannot get
    by buying one item.
