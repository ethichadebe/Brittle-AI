# 2026-09-21 — Anonymous first, and a bug wearing a feature's clothes

- **Asked for:** grill accounts, then re-examine the compare feature against
  whatever the accounts grill turned up.
- **Worked first time:** no, and the two corrections came from opposite
  directions — one mine, one the domain expert's.
- **Laptop needed:** no.
- **Friction:**

  - **The request contained a live bug and a feature welded together.**
    "Everyone opening the application sees the same lists" is not a missing
    account system; it is a privacy leak on a deployed app, where any visitor
    can read and edit anyone else's shopping. Fixing it needs a per-device
    identity and ships on its own. **Accounts** solve a different problem —
    continuity across devices, and having something to bill.

  - **`List.userId` was already there and nobody had decided it.** Nullable, and
    read by nothing in the codebase. It arrived in `df76b91`, a commit about
    Playwright WAF bypass, so it came along incidentally. A half-built
    assumption sitting in the data model is worse than no assumption, because
    the next reader takes it for a decision.

  - **The glossary caught a second word for the same person.** The docs say
    **Shopper** throughout; the request said "users". Settled as **Shopper**
    for the person and **Account** for the credential, which keeps every
    existing line in `CONTEXT.md` valid.

  - **Anonymous-first carries a cost that had to be chosen, not discovered.** A
    shopper who clears their browser loses their lists permanently and no
    support request can recover them, because nothing ever proved the lists were
    theirs. Recorded in the ADR as accepted, said plainly in the app, with the
    prompt for an **Account** arriving once a list is worth keeping.

  - **I recommended merging lists on sign-in; the domain expert found the flaw
    and then fixed it.** I said merge always and accept duplicates. The
    objection is that `List` is store-scoped, so combining two "Monthly" lists
    could produce one list priced against a store that does not sell half of it.
    The fix proposed was to merge only within the same store, and to sum
    quantities rather than duplicate rows — which removes the objection
    entirely.

  - **Then I revised my own answer, because their fix changed the arithmetic.**
    Summing quantities cannot be undone: a milk of 1 and a milk of 2 become a
    milk of 3, with nothing recording that it was ever two lists. I had
    dismissed asking the shopper because it meant a modal on every sign-in;
    scoped to same-name-and-same-store, the collision is rare enough that a
    prompt costs almost nothing. Everywhere else here the rule is visible
    imperfection over silent loss — this is the one place where merging *is* the
    irreversible option, so it is asked rather than assumed.

  - **One thing found on the way, unrelated to accounts.**
    `backend/src/routes/listItems.ts:84` calls `prisma.listItem.create`
    unconditionally, with no lookup. Adding milk twice today gives two rows at
    quantity 1 each — a correct total and a list that looks careless. A live
    papercut with its own fix.
