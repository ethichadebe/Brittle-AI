# 2026-09-17 — Makro's pricing model, and three goes at showing it

- **Asked for:** read Makro's product fields off the live page.
- **Worked first time:** no. The display was wrong three times in a row, each
  time for a different reason, each time hiding the answer rather than getting
  it wrong.
- **Laptop needed:** no. Free, no credits.
- **Friction:**
  - **Take one**, insertion order: showed a reviews widget's fields.
  - **Take two**, ranked by relevance: worked too well. Makro carries more than
    sixteen price fields, so prices filled every slot and the title and image
    vanished again. Fixed by taking a few from each category rather than sorting
    the whole list.
  - **Take three**, per-category caps: the price bucket filled with *labels* —
    `priceType: "DELIVERY_CHARGE"`, `listingPriceType: "REGULAR"`,
    `showDiscountAsAmount: false` — while `mrp.value` and `prices[].value`, the
    only fields a parser can read, were pushed out. A price is a number;
    numeric values sort first within a category now.
  - Three rounds on "what to show", after two on "what to rank". The data was
    right every time and the presentation was wrong, which is its own lesson:
    an honest probe that buries its finding is not much better than one that
    misses it.
- **What the page actually says:**

  ```
  pricing.discountAmount  11400          <- cents
  pricing.totalDiscount     114          <- rands
  mrp.value                 329   MRP
  prices[0].value           329   FSP           "Selling Price"
  prices[1].value           215   SPECIAL_PRICE "Special Price"
  finalPrice.value          215   TOTAL         "Total"
  titles.title / titles.subtitle
  value.imageUrl (on makro.co.za), value.itemId
  ```

  `329 - 215 = 114`, and `discountAmount` is `11400`. **That field is in cents
  while every other price is in rands.** A parser mixing them is out by a factor
  of a hundred, and nothing about the name says so.
- **A decision for a human, not a default:** `finalPrice` is named "Total" with
  `priceType: TOTAL`, and sits beside a `deliveryCharge` block. On this product
  delivery is zero, so `finalPrice` and `SPECIAL_PRICE` agree at 215 — which
  means the sample cannot distinguish "the special price" from "the special
  price plus delivery". Reading `prices[]` by `priceType` is the safer mapping:
  `FSP` for the regular price and `SPECIAL_PRICE` for the promotional one, with
  `finalPrice` left alone.
