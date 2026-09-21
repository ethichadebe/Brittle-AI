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
R160" — not a unit price.
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
