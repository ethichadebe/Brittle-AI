# 2026-09-21 — The fourth butter, and why three were not enough

- **Asked for:** finish the **Conditional Price** term — specifically the one
  thing quantity 3 could not answer.
- **Worked first time:** yes. One quantity change, one screenshot, settled.
- **Laptop needed:** no. The same phone and the same cart as an hour earlier.
- **Friction:**

  - **The deal repeats per pair.** Quantity 4 came back **R340.00**, which was
    the per-pair prediction to the cent. The other branch was R369.98. The
    discount line says the same thing independently: **R59.96, exactly twice
    R29.98** — two applications, not one larger one.

  - **Three units were genuinely ambiguous, and stopping there was right.** A
    basket of three holds exactly one qualifying pair, so "applies once per
    pair" and "applies once per basket" predict the same R269.99. Writing the
    rule off that run would have been one measurement carrying two claims, and
    it would have been wrong in the direction that over-charges the shopper on
    every large basket.

  - **The rule is now a formula, and it reproduces all four rows.** For n units
    of a "buy `g` for R`d`" deal:

    ```
    total = floor(n / g) * d + (n % g) * shelfPrice
    ```

    Checked against 1 → 99.99, 2 → 170.00, 3 → 269.99, 4 → 340.00. Four
    observations, one expression, no residual.

  - **A detail in the screenshot bounds the code change.** The line item itself
    reads "YOU SAVED R59.96 / R340.00" — Woolworths attributes the discount to
    the **line**, not across the basket. So `computeSummary`'s `lineTotal` going
    piecewise is sufficient; there is no cross-item basket logic to write. That
    was not the question being asked, and it is the most useful thing the run
    produced for whoever picks up #28.

  - **Still inferred, not observed.** The cart took the `loyalty: false` promo
    throughout — R170, never the R160 MyDifference price. The flag is doing the
    work it should, but nobody has measured the same cart signed in with
    WRewards, so the R160 path remains the half we have reasoned to rather than
    seen. Left flagged rather than quietly rounded up to "confirmed".
