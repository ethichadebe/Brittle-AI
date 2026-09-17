# 2026-09-17 — Makro's real mapping, and a finding I made up

- **Asked for:** read Makro's product fields off the live page.
- **Worked first time:** the display fix did. One thing I had already written
  down turned out to be fiction.
- **Laptop needed:** no. Free, no credits.
- **A correction, and the worst kind:** the previous note and pull request #44
  recorded

  ```
  pricing.totalDiscount     114          <- rands
  ```

  The live page says **34**. `329 - 215 = 114`, and `114 / 329` is about 34.6%,
  so `totalDiscount` is a **percentage**, not an amount. The 114 came from the
  fixture I had written by hand to test the display, and I transcribed my own
  invented value into the journal as though the site had said it. Every other
  line in that block was real, which is exactly what made it easy to miss. A
  probe exists so the site answers instead of me, and I put words in its mouth.
- **What the live page actually says:**

  ```
  value.title            Parmalat Everfresh ...
  value.productId        MLKHFXJTMMYEPC...
  value.itemId           ITM40ECCC8072E...
  value.imageUrl         https://www.makro.co.za/...
  mrp.value              329   MRP
  prices[0].value        329   FSP            "Selling Price"
  prices[1].value        215   SPECIAL_PRICE  "Special Price"
  finalPrice.value       215   TOTAL
  pricing.discountAmount 11400               <- cents
  pricing.totalDiscount     34               <- percent
  pricing.currency       INR
  ```

- **`currency` says INR.** Flipkart's platform is not fully localised: the
  prices are rands and the currency field says Indian Rupees. Harmless as long
  as nothing reads it, and a trap the moment something does.
- **Three fields, three different units.** `mrp`/`prices`/`finalPrice` in rands,
  `discountAmount` in cents, `totalDiscount` in percent. Nothing in any name
  says which, and the two discount fields sit side by side.
- **Pagination, now answered:** step [4] counts distinct product ids in the
  page. Five. A milk search returns far more, so the rest arrive by XHR and a
  scraper reading only this page would show five products where Checkers shows
  twenty. That is a real limitation to decide on before writing it, not after.
