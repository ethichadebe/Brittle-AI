# 2026-09-17 — Makro live, and a question about who runs the commands

- **Asked for:** Makro as the fifth store, then switch it on.
- **Worked first time:** the scraper did. The smoke test's first run returned a
  502, which was the container swapping mid-deploy rather than anything wrong —
  `Up 3 minutes` and clean startup logs on the next look.
- **Laptop needed:** yes, for all of it, and that turned out to be the story of
  the day.
- **The live result:**

  ```
  makro     milk   200  2s n=20  L=0
  PASS 1/1
  M Full Cream Milk - UHT Proces R18.95
  ```

  Twenty products, two seconds, zero ScraperAPI credits. `L=0` is correct rather
  than a failure: `makro.ts` never sets `loyaltyPrice`, because Makro's "Special
  Price" is a public promotion and Makro has no loyalty programme. The smoke
  script's `no loyalty prices seen (issue #7)` line is a false alarm for such a
  store — worth teaching it the difference, but not in this change.
- **Friction, and most of it mine:**
  - The user asked why they were pasting every command, and whether this session
    could SSH to the box. It cannot: the container has no credentials, and the
    egress proxy refuses even HTTPS to the app's public domain
    (`connect_rejected`, organisation policy). Every observation of the live
    system has to come through a human, by design.
  - That is a real constraint, but it is not the reason today took thirty
    commands. The probe's display alone cost five rounds — ranked by size, then
    insertion order, then per-category caps, then numbers-first — and each was
    pushed before being tested against a fixture that resembled the live page.
    Once the fixtures mirrored Flipkart's actual shape, it converged in one.
    That was available from the first round.
  - Recorded as a working rule: when the only way to see a result is another
    person's terminal, the cost of shipping an untested version is not one round
    trip, it is their attention. Build the fixture first.
- **Switched on** after a live check rather than before, which is the difference
  from Woolworths — where the store went live with its price zone unverified and
  #27 is still open.
