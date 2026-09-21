# 2026-09-21 — Comparing baskets, not packs

- **Asked for:** grill feature 2, the compare feature, which is the app's main
  use case.
- **Worked first time:** yes. Three questions, three decisions, one ADR.
- **Laptop needed:** no.
- **Friction:**

  - **The hard part of compare is not the button, it is identity.** A list is
    scoped to one store and items are matched by exact `productId`. Across
    stores there is no shared identity at all — Woolworths' `123` and Checkers'
    `456` are unrelated strings. Every question worth asking about this feature
    falls out of that.

  - **Dropping unmatched items fails in the most misleading direction
    available.** Eighteen items at Woolworths for R400 against fourteen at
    Checkers for R280 reads as Checkers being cheaper. It is not; it is missing
    four things. A store that stocks less would win every comparison, silently.
    So unmatched items get a **Substitute**, visible as one and removable,
    rather than being quietly dropped.

  - **The substitution that lies is about size, not brand.** Swapping a 250 g
    butter for a 500 g one shows a R45 saving and delivers half the butter.
    Across a twenty-item basket, "Checkers saves you R180" could be entirely
    manufactured by substituting smaller packs. Resolved: a **Substitute** is
    judged by **Unit Price**, and where **Pack Size** cannot be read from the
    product name, there is no substitute at all.

  - **That last clause is the one a future reader will want to undo.** Size
    parsing breaks quietly, so more items will come back unmatched than anyone
    would like, and the obvious fix is a fuzzy fallback. That trades visible
    unmatched items for silently wrong totals, which is the wrong way round.
    Written into ADR 0002 as a refusal rather than a limitation, so it reads as
    deliberate.

  - **The cost decided the scope.** A twenty-item list against four stores is
    eighty searches, forty of them metered — twenty-five comparisons a month
    across all users, on an allowance of 1,000. One store at a time is four
    times cheaper, answers the question a shopper actually asks, and leaves
    all-at-once as something to sell rather than something already given away.

  - **Still open, and named rather than assumed.** Whether a **Comparison**
    persists or is thrown away; whether a **Substitute** the shopper accepted is
    remembered next time; and whether either is possible before accounts exist,
    since both are per-shopper state and every visitor currently shares one set
    of lists.
