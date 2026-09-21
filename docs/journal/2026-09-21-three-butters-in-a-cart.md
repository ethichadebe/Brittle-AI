# 2026-09-21 — Three butters in a cart, and what the till actually does

- **Asked for:** finish the **Conditional Price** term the last grilling
  session stopped on.
- **Worked first time:** yes, but only because the question was narrowed to one
  product and three quantities before anyone was asked to look at anything.
- **Laptop needed:** no. A phone, the Woolworths cart, three screenshots.
- **Friction:**

  - **The observation settled it.** "Salted Butter 500 g" at quantity 1, 2 and
    3: R99.99, R170.00, R269.99, with the cart showing R299.97 less a R29.98
    discount at quantity 3. Shelf price R99.99, deal worth R29.98, applied as a
    basket-level discount, third unit at shelf price. None of that needed
    interpretation — the numbers reconcile exactly.

  - **Quantity 1 closed the branch that would have been worst.** If the deal
    price had leaked onto a single unit, a shopper with one butter in their
    list would be quoted R85 for something that rings up at R99.99. It does
    not: quantity 1 is shelf price with a prompt to add another.

  - **Three is not enough to finish the rule, and saying so is the point.**
    Quantity 3 contains exactly one qualifying pair, so it cannot distinguish
    "the deal applies once per pair" from "once per basket". Quantity 4
    separates them — R340.00 against R369.98 — and that is the whole remaining
    question. Writing "remainder at shelf price, deal repeats per pair" would
    have been one measurement's worth of evidence carrying two claims.

  - **The cart paid R170, not the R160 MyDifference price.** The two promos on
    that product differ only in `product_promo_info[].loyalty`, and the cart
    took the `loyalty: false` one. That is the flag behaving as the
    discriminator #28 needs. It is still not proof: nobody measured the same
    cart signed in with WRewards, so R160 remains the inferred half.

  - **The gap this exposes is in our model, not in Woolworths.**
    `computeSummary` is `price(item) * item.quantity` — linear — and a
    conditional price is piecewise. `ListItem` has `regularPrice`,
    `loyaltyPrice` and `quantity`, and no way to say "R170 for two". So #28
    cannot be "wire `loyalty` into the parser": that would put R80 or R85 on
    screen as a unit price the shopper cannot buy one of. It is a product
    decision first and a parser change second, and it should be split.
