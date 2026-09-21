# 2026-09-21 — Promotions are national, base prices are regional

- **Asked for:** re-run the Woolworths probe after #67 added the diagnostic
  that tells an unlucky sample from a method that cannot work.
- **Worked first time:** yes. Both questions came back decisively, and one of
  them killed the method the probe was built around.
- **Laptop needed:** no — one command, output read from a screenshot.
- **Friction:**

  - **The hypothesis held, and #27's arithmetic shortcut is dead.**

    ```
    zones differ on
      promoted: 0/3
      all:     14/40
    ```

    14 of 40 products carry different prices in different zones. Not one of the
    3 promoted products does. So Woolworths prices promotions nationally and
    base prices regionally, and `Now + Save` can never name a zone — not
    because of an unlucky sample, but because the promoted subset is the one
    part of the catalogue that carries no zone signal at all. Retrying with
    another query would have been wasted attention, which is exactly what the
    diagnostic was added to prevent.

  - **Honest about the sample size.** This is 3 promoted products from one
    query, and the default query has been `milk` both runs, so it is likely the
    same 3 products twice — n=3, not n=6. What is not in doubt is the shape of
    the argument: on this sample the method produced no signal, and the
    catalogue demonstrably has one to produce. A fourth promoted product
    somewhere that does differ by zone would rescue the method, but planning
    around that is hoping, not measuring.

  - **So the probe now hands over the method that is left.** #27 originally
    proposed reading a product page by eye. That still works, and the least a
    probe can do is turn "go find a product" into a shortlist: section `[6]`
    prints up to three products whose three zone prices differ, with the
    numbers, so one look at the signed-out site names the zone.

  - **#28 has a live lead, and it is the `loyalty` flag.** It now prints
    `false | true`, so both values occur. More than that, one product carried
    **two promos at different prices**:

    ```
    prd_promomsg
      Buy any 3 for R66 Yoghurt Corner Pots
      | MyDifference: Buy 2 For R160 Salted Butter
    ...
    [1].prd_promomsg
      Buy 2 for R170 Salted Butter
    ```

    R160 against R170 on what reads as the same butter — which is what a
    loyalty price *is*. `MyDifference` is Woolworths' own promotion branding,
    sitting on the cheaper one.

  - **But the aggregated view could not prove the correlation**, and that
    matters. `[4]` prints distinct values per path across products, so it can
    say `loyalty` takes both values and that two prices exist without saying
    which goes with which. Reading R160-with-`loyalty:true` off that display
    would have been inference dressed as observation. The probe now prints the
    promos **grouped by product**, walked generically rather than by field
    name, so the next run either shows the pairing or does not.

  - **Hoisting `wrap` was a real fix, not tidying.** It was defined inside
    `[4]`'s `else` branch; section `[6]` uses it, so a response with no
    `product_promo_info` would have died with `NameError` at exactly the moment
    someone most needed the by-hand shortlist. Caught by writing the test for
    that case rather than by reading the code — un-hoisting it now fails five
    assertions.
