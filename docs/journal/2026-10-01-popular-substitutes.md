# 2026-10-01 — Popular Substitutes

- **Asked for:** #103, an idea that came up while grilling #91: once enough
  accounts pick the same Substitute, make it the "official" one for
  everybody. Grilled into rules before building (in the issue and ADR 0005).
- **Worked first time:** yes, apart from one badge wrapping onto two lines,
  caught in a screenshot.
- **Laptop needed:** no.
- **Friction:**

  - **"Official" was the wrong word.** Nobody vouches for it except the
    shoppers who picked it. It's a **Popular Substitute** in `CONTEXT.md`,
    with a "Popular pick" badge on screen.

  - **The first feature where one shopper's taps change someone else's
    total.** #91 deliberately treated a pick as a personal preference. So
    the rules lean towards the individual: your own pick beats a popular
    one, a pairing you removed never comes back for you, and unticking a
    popular pick saves your own removal, which counts against it.

  - **No new storage.** Every pick and removal from #91 is already one row
    per account per pairing, most recent wins. That is exactly "current
    decisions only". Popularity is counted from those rows at comparison
    time, so it can't drift out of sync with them. Fine at this size; if
    comparisons get slow with many users, caching the tally is the obvious
    next step.

  - **Faking it was easy, so it got a cheap guard.** Sign-up doesn't verify
    email and a saved pick isn't checked against what a comparison offered,
    so three scripted sign-ups could make anything popular. Only accounts
    at least 3 days old count. It doesn't stop someone patient; the
    label, the untick and removals counting against are the real safety
    net. ADR 0005 says email verification should replace the age check
    when it exists.

  - **The threshold is deliberately low (3) and raised by hand.** Low so
    it can be live-tested with a few real accounts; by hand so a pairing
    never stops being popular just because more people signed up.

  - **`chosenByShopper` became `source`** (`accucery` / `shopper` /
    `popular`), since a yes/no couldn't say "popular". Frontend and backend
    ship together; an old cached tab would just show every stand-in as
    "Substitute" until refreshed.

  - **Mutation-checked:** ignoring removals, ignoring account age and
    dropping the threshold to 2 each fail the test meant for them.

  - **Next:** a live test needs three accounts at least 3 days old picking
    the same suggestion for the same product at the same store. Then the
    frontend redesign.
