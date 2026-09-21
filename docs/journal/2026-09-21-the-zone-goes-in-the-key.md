# 2026-09-21 — The zone goes in the key, and the first ADR

- **Asked for:** finish grilling feature 1, the product cache.
- **Worked first time:** yes. Four questions, four answers, no rework.
- **Laptop needed:** no.
- **Friction:**

  - **The domain expert reached for a word the glossary had already ruled out.**
    The proposal was to "add a region as a key". `CONTEXT.md` defines **Price
    Zone** and lists *region* on its `_Avoid_` line. The instinct was right and
    the word was the one we had agreed not to use — which is the first time the
    glossary has earned its keep by catching something rather than describing
    it after the fact.

  - **The decision that matters is not the column, it is what goes in it
    today.** One zone serves every shopper, so `NULL` or `"default"` is
    tempting. It would leave rows whose zone is *unknown* rather than merely
    uniform, and unknown rows have to be thrown away when #66 lands. Writing
    the real zone at scrape time - `p10` for Woolworths, the `storeContexts`
    branch for Checkers - is the whole difference between #66 being a migration
    and being a rewrite.

  - **First ADR in the repo.** The zone identifier passed all three bars: hard
    to reverse once rows exist, genuinely surprising to a future reader (*why
    is there an opaque per-store string here when everyone gets one zone?*), and
    the result of a real trade-off against a region concept of our own, which is
    blocked on a mapping #66 says nobody has for any store. `docs/adr/` did not
    exist until now; nothing before this met the bar.

  - **One answer is asserted, not measured, and is labelled as such.** Whether a
    zone changes *which products* a store sells or only *what they cost* is
    settled as prices only. For Woolworths that is measured - one response
    carries p10, p30 and p60 together, so its product set cannot vary. For
    Checkers and Shoprite it is the domain expert's judgement. Taken, because
    the zone is in the price key either way and the failure mode if it is wrong
    is mild: a shopper sees a product their branch does not stock, rather than a
    price they will not be charged. Recorded as asserted so the next reader does
    not inherit it as a finding.
