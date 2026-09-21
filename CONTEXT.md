# Accucery

A grocery list app that prices each list against a specific South African
retailer's live catalogue, so a shopper knows their basket total before they
reach the till.

## Language

### Prices

**Shelf Price**:
What any shopper pays for one unit, with no card and no conditions.
_Avoid_: regular price (the field name), normal price, base price

**Loyalty Price**:
A reduced price available only to members of that store's rewards programme,
when they scan their card or app.
_Avoid_: member price, card price, discount

**Promotional Price**:
A reduced price any shopper gets without a card — a public sale.
_Avoid_: special, deal, promo price

**Conditional Price**:
A price that applies only when a quantity condition is met, such as "Buy 2 for
R170" — not a unit price. The till charges the **Shelf Price** for every unit
and then subtracts the difference once the condition is met, so a **Conditional
Price** reduces a basket; it never changes what one unit costs.
_Avoid_: multi-buy price, bulk price

### Stores

**Store**:
A South African retailer Accucery can price a list against.
_Avoid_: shop, retailer, chain

**Rewards Programme**:
A store's card scheme that unlocks its **Loyalty Prices** — Xtra Savings,
Smart Shopper, WRewards.
_Avoid_: loyalty card, rewards card, loyalty scheme

**Price Zone**:
The region whose prices a store quotes, which differs by where the shopper is.
_Avoid_: region, area, branch pricing

## Relationships

- A **Product** always has a **Shelf Price**
- A **Product** may additionally have a **Loyalty Price**, a **Promotional
  Price**, or both
- A **Loyalty Price** requires the shopper to be a member of that **Store**'s
  **Rewards Programme**; a **Promotional Price** requires nothing
- A **Store** has at most one **Rewards Programme**; Makro has none
- A **Shelf Price** is quoted for one **Price Zone**
- A **Conditional Price** attaches to a quantity, not to a unit, so it is
  neither a **Shelf Price** nor a **Loyalty Price** and cannot be stored as one
- A **Conditional Price** may be card-gated or not; one product can carry both
  versions of the same deal at different prices

## Example dialogue

> **Dev:** "Woolworths shows `NOW R99.99 SAVE R27` on a product. Is that its
> **Loyalty Price**?"
>
> **Domain expert:** "Only if you need a WRewards card to get it. A **Loyalty
> Price** is exclusive to members who scan. If anyone walking in pays R99.99,
> that is a **Promotional Price** and it should reduce the basket for every
> shopper, card or not."
>
> **Dev:** "And `MyDifference: Buy 2 For R160`?"
>
> **Domain expert:** "That one is card-gated, so it is a **Loyalty Price** —
> but it is also a **Conditional Price**. R160 is not what one costs."
>
> **Dev:** "If I put three of them in the basket, what do I pay?"
>
> **Domain expert:** "Two at the deal and one at the **Shelf Price**. The cart
> reads R299.97, less a R29.98 discount, so R269.99. The deal comes off the
> basket total — it does not reprice the product."

## Flagged ambiguities

- **"loyaltyPrice" is populated inconsistently across scrapers.** Pick n Pay
  reads `promotionDisplayType === "SMART_SHOPPER"`, which is genuinely a
  **Loyalty Price**. Makro deliberately sets `null` because its Special Price
  is a **Promotional Price**. Woolworths parses `"Now R<x>"` out of marketing
  copy, and Checkers/Shoprite read `bonusBuy`. Resolved: **Loyalty Price**
  means card-gated only. Woolworths' `"Now R<x>"` is card-gated (WRewards), so
  that scraper is correct. Checkers/Shoprite's `bonusBuy` has still not been
  established either way.
- **Woolworths expresses promotions two ways, and only one carries a
  card-gating flag.** Simple price cuts arrive as `"Now R<x> Save R<y>"` in the
  `promo` copy array; conditional multi-buys arrive as structured
  `product_promo_info` entries carrying `loyalty: true | false`. The two sit on
  disjoint sets of products, which initially read as a contradiction. Resolved:
  both are **Rewards Programme**-capable, they are different promotion
  *shapes*. The flag exists on the structured form because a multi-buy may be a
  **Loyalty Price** or a **Promotional Price**, whereas a `"Now R<x>"` cut is
  always a **Loyalty Price**.
- **"discount" was used for both a public sale and a card-gated price.**
  Resolved: these are **Promotional Price** and **Loyalty Price**, and they
  differ in who can get them, which changes whose basket total they affect.
- **What a Conditional Price does past the qualifying quantity.** Measured on
  2026-09-21 by putting Woolworths' "Salted Butter 500 g" in a cart and
  changing the quantity:

  | Qty | Cart | Discount shown |
  |---|---|---|
  | 1 | R99.99 | none — "Add 1 more! Buy 2 For R170" |
  | 2 | R170.00 | R29.98 |
  | 3 | R269.99 | R29.98 |

  Resolved: the **Shelf Price** is R99.99, the deal is worth R29.98
  (2 × 99.99 − 170), it is applied as a basket-level discount rather than a new
  unit price, it does **not** leak onto a single unit, and units past the
  qualifying group are charged at the **Shelf Price**. Still open: at quantity
  3 there is only one qualifying pair, so this run cannot tell "once per
  qualifying pair" from "once per basket". Quantity 4 separates them — R340.00
  if it repeats, R369.98 if it does not.
- **The cart charged R170, not the R160 MyDifference price.** The two promos on
  that product differ only in `product_promo_info[].loyalty`, and the cart took
  the `loyalty: false` one. That is consistent with the flag being the real
  discriminator and this cart not carrying **WRewards**, but it was not
  measured signed in, so the R160 path is inferred rather than observed.
- **The app cannot express a Conditional Price at all.** `computeSummary` is
  `price(item) * item.quantity` (`frontend/src/lib/summary.ts:13`) — linear in
  quantity — while a **Conditional Price** is piecewise. `ListItem` carries
  `regularPrice`, `loyaltyPrice` and `quantity`, and nothing that says "R170 for
  two". Unresolved: whether the summary bar should price these exactly or the
  app should only surface the deal as a prompt.
