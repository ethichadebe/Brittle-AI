# 2026-09-21 — The first four terms, and one the code got wrong

- **Asked for:** `/grill-with-docs` before turning the new features into issues.
- **Worked first time:** partly. Two terms resolved cleanly; the third stopped
  the session dead because it needs an observation nobody has made yet.
- **Laptop needed:** not yet. The next step does need a phone and a Woolworths
  cart.
- **Friction:**

  - **`CONTEXT.md` and `docs/adr/` did not exist.** `CLAUDE.md` says
    `/grill-with-docs` creates them lazily and their absence is not a defect,
    which held: this is the first session with something worth writing down.
    Only `CONTEXT.md` so far — no decision has yet met the bar for an ADR.

  - **The first question found a real inconsistency.** `loyaltyPrice` is
    populated differently by every scraper: Pick n Pay from
    `promotionDisplayType === "SMART_SHOPPER"`, Checkers/Shoprite from
    `bonusBuy`, Woolworths from `"Now R<x>"` parsed out of marketing copy, and
    Makro deliberately not at all. `makro.ts` already articulated the right
    rule — *"a public promotion rather than a card-gated one"* — and it had
    been applied to exactly one store.

  - **Resolved: a Loyalty Price is card-gated only.** Exclusive to members of
    that store's rewards programme, when they scan. A public sale is a
    **Promotional Price** and belongs in the shelf price, because everyone
    pays it. This matters because `computeSummary` only applies `loyaltyPrice`
    when the shopper has toggled that store's card on — so a public discount
    stored as a loyalty price means a shopper without the card is quoted a
    total higher than they will actually pay.

  - **I was wrong about Woolworths, and the domain expert corrected it.** I
    argued `"NOW R99.99 SAVE R27"` was a **Promotional Price**: it was
    advertised to a signed-out visitor, and Woolworths marks card-gating
    structurally with `product_promo_info[].loyalty` on a disjoint set of
    products. The answer is that it is a **Loyalty Price** — WRewards. That
    resolves the disjointness as two promotion *shapes* rather than a
    contradiction: simple price cuts arrive as copy, conditional multi-buys
    arrive structured, and the flag exists on the structured form because
    those can go either way. Recording that I inferred the opposite from the
    payload, because the payload alone does not carry it.

  - **Still unresolved: what the app should do with a Conditional Price.**
    "Buy 2 for R160" is not a unit price, and `Product.loyaltyPrice` is a
    single number. The app does know `quantity`, so it could be exact — but
    what "exact" means at quantity 3 is a question about Woolworths, not about
    our types.

  - **The session stopped rather than guessing, and the environment forced
    it.** `docs/agents/automation.md` asserts a cloud session cannot reach the
    store sites; that is now verified rather than assumed —
    `curl https://www.woolworths.co.za` returns 000, and `WebFetch` returns
    `EGRESS_BLOCKED` from the proxy. Web search finds the promotion shapes but
    no terms covering the third unit. So the next move is a cart with three of
    one butter in it, and a person to look at the total.
