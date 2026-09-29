# 2026-09-29 — Asking, and finding a leak the asking itself created

- **Asked for:** build #86 — ask before combining lists that collide at
  sign-in, the case #85 deliberately left alone.
- **Worked first time:** no. Adding a way to *resolve* a collision opened a
  new attack surface that adding the collision itself never had, and the
  first mutation check found it.
- **Laptop needed:** no. Postgres had gone down again between sessions —
  restarting the cluster and recreating the test database is now routine.
- **Friction:**

  - **#85 already left colliding lists alone; #86 had to make that
    reversible, not just visible.** `claimAnonymousLists` now returns which
    lists collided instead of silently skipping them. The sign-up/sign-in
    response carries that list; a new endpoint,
    `POST /accounts/collisions/:id/resolve`, lets the Shopper say
    *combine* or *keep-both* for each one.

  - **The mutation check that mattered wasn't the merge, it was the lookup
    that decides which list to merge into.** The colliding Account list is
    found by name and Store — and the first version of that lookup filtered
    only by name and Store, having already trusted that the caller was
    signed in as *some* Account without also requiring it to be *that*
    Account's own list. Two different Accounts sharing an unremarkable name
    like "Monthly" at the same store is not a contrived scenario; it is the
    default outcome of two people naming a list the same ordinary thing.

  - **The first mutation attempt exposed that no existing test would have
    caught it.** Dropping the Account filter passed the whole suite
    unchanged — the gap was real, not hypothetical, and it existed because
    every prior test's Shopper only ever had one Account's worth of lists
    to collide with. Added a dedicated test with a third, unrelated Account
    holding its own "Monthly"/checkers list, then confirmed the mutation
    now fails it by name: the intended Account's list stayed unmerged while
    the stranger's silently absorbed it in the mutated version. Reverted,
    reran, green.

  - **Combining reuses no new merge logic — it is #83's rule, applied
    between lists instead of within one.** Matching by `productId`, summing
    quantities, moving anything unmatched across wholesale. Mutation-checked
    separately: disabling the product match turned the merge into two rows
    of the same product instead of one summed row, which the dedicated test
    caught immediately.

  - **Dismissing the prompt is not a third path.** The frontend's modal has
    two buttons, and clicking the backdrop to close it invokes the same
    "keep-both" action as the button — never leaves the collision
    unresolved, and never merges by accident. That was the plainest reading
    of #86's own acceptance criteria: *never silent combine*, not *never
    silent anything*.

  - **Renaming reuses #85's own collision detection to stay correct.** The
    disambiguated name ("Monthly (2)", incrementing if that is also taken)
    is checked against the Account's current lists at the moment of
    resolving, not against whatever the sign-in response said minutes
    earlier — the same reasoning ADR 0003 already gives for recomputing
    ownership at resolve time rather than trusting a stale pairing.
