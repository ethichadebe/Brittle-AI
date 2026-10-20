# 2026-10-20 — Compare reads "Per KG" as a size

- **Asked for:**
  - The owner checked #197's fix on the live app. Pick n Pay and Shoprite now gave sensible picks for a Woolworths list.
  - At Checkers, the whole chicken was "not found". The suggestions offered were frozen mixed portions.
  - A Checkers search showed it does sell one: "Simple Truth Free-Range Fresh Whole Chicken Per KG".
- **Cause:**
  - Checkers names what it sells by weight "Per KG", and its price is per kilogram.
  - The size reader found no number in that name, so the chicken had no size.
  - Where any other candidate does have a size, an unsized one is left out. So mixed portions in 5 kg and 2 kg bags were offered instead.
- **What changed:**
  - "Per KG", "per kilogram" and "/kg" read as a 1 kg size.
  - A shelf weight beside it, such as "Avg 1.2kg", doesn't override it, since the price is for one kilogram.
  - The chicken now matches by weight: R64.99 a kilogram is about R84.49 for the 1.3 kg the list holds.
- **Worked first time:** yes.
  - Tests use the names from the owner's screenshots. They check the size is read and that the whole chicken wins over the portions.
  - Switching the new reading off fails both.
- **Laptop needed:** no.
- **Friction:** none. The screenshots showed both the bad suggestion and the product it should have been, so no server run was needed.
