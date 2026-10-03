# 2026-10-03 — Ask the location probe which store it was priced at (#66)

- **Asked for:** nothing new. This follows the second run of the location
  probe, which is posted on #66.
- **Worked first time:** yes. The offline test was extended first, and I
  broke the new line on purpose to check the test catches it.
- **Laptop needed:** no.
- **Friction:**

  - **The second run worked, and Pick n Pay clearly varies by place.** 37
    of 136 products differ in price.
    - The Western Cape and Eastern Cape pay more for staples. For example,
      6 eggs cost R22.99 there and R17.99 elsewhere.
    - Gauteng, Free State, Limpopo, Mpumalanga, North West and Northern
      Cape mostly match each other. KwaZulu-Natal sits in between.
    - The range differs too: 137 products are stocked in only some places.
    - It matches the hand check exactly.

  - **Checkers and Shoprite came back identical in all nine provinces.**
    That's 120 and 97 products, every price the same, and the same range.
    - The hand check found a different bread price and a different Oros
      promotion between Sandton and Sea Point. So "identical" is more likely
      the site ignoring the place than a fact about the shop.
    - Every product in the reply names the store it was priced at. The
      probe now prints that store and whether it is one of the stores the
      site named for the place.
    - A small run (two places, one search) tells which it is before anything
      is built on either answer.
    - If it says "NOT from", the production scraper is likely pricing
      Checkers and Shoprite at a default store too.

  - **It said "NOT from".** On a third, small run, Sandton and Sea Point were
    both priced at one Cape Town Checkers store. Both Shoprite searches were
    priced at a store near neither place.
    - The branch went in the search body only. That is also how the
      production scraper sends it through ScraperAPI, so the app's Checkers
      and Shoprite prices are probably from a default store as well.
    - A browser also carries the branch in a `storeContexts` cookie. The
      probe now sends that cookie too.
    - The stand-in now reads only the cookie, so a probe without it fails
      the test. That is checked by removing it.
    - **Not yet known:** whether ScraperAPI passes the cookie on. The next
      run shows that.
