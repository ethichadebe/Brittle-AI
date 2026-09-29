# 2026-09-29 — The compare feature itself

- **Asked for:** #90 — price a list against one other Store the Shopper
  chooses, signed in only. The last of the issues that were explicitly
  blocking compare (#74/#75/#76/#89), and the first of this chain with a
  real UI surface.
- **Worked first time:** yes, on the shape that shipped. The total's math
  (below) is the one place I slowed down rather than reaching for the
  obvious wrong answer.
- **Laptop needed:** no.
- **Friction:**

  - **"Every Substitute must be visibly marked as distinct from an exact
    match" — but there is no exact-match case to distinguish it from.**
    There is no shared product identity across stores (#89's own premise),
    so *every* successful match #90 can produce is inherently a best-guess
    Substitute, never a verified identical product. Read literally, the
    acceptance criterion asks for something the domain model doesn't
    support. Resolved it as: every matched item in a comparison carries a
    "Substitute" badge, unconditionally — which still satisfies the
    criterion's actual purpose (a shopper must never mistake a comparison
    line for their own exact list item), just without inventing a
    same-product detector this codebase has no way to build honestly.

  - **What a Substitute "costs" isn't its own price tag.** A naive total
    would price each matched item at the Substitute's own regularPrice ×
    the shopper's quantity — but if the shopper wanted 2 packs of 2 L milk
    (4 L) and the only match at the target store is sold in 1 L bottles,
    "2 packs of the substitute" is only 2 L, half of what's needed. Fixed
    by working in the same base units #89's Unit Price already exists for:
    recover how many grams/millilitres the shopper's own quantity
    represents from the original item's own price and Unit Price, then
    price *that much* of the Substitute at its Unit Price. No new field
    needed on `matchItem`'s result — `originalPackQuantity = regularPrice /
    unitPrice` falls out of what it already returns.

  - **#76's search caching was trapped in `routes/search.ts` a second
    time.** #89 already pulled it out into `services/search.ts` once; this
    issue is the second consumer (`compareList` needs the exact same
    cached lookup `matchItem` does), which is exactly the case that
    extraction was for. Nothing new to fix here — just confirmation the
    earlier refactor was aimed at the right thing.

  - **The 401 is deliberately not the whole feature.** #90's acceptance
    criterion is "prompted to sign in, not silently blocked or silently
    allowed" — the backend's job is only to refuse cleanly; the frontend
    is what turns that refusal into an actual prompt (a modal with a
    button to `/account`), which already existed as a route from #84 and
    needed nothing new.

  - **Removing a Substitute doesn't need a second network round trip.**
    The backend already prices every matched item; unchecking one in the
    results sheet just excludes it from a client-side sum. Simpler than it
    sounds, and the acceptance criterion ("removing a Substitute
    recalculates the total") reads like it wants a mutation, but nothing
    about the comparison actually needs to be told about a change of mind.

  - **Live-testable, unlike the last four issues.** This one has an actual
    button, an actual sheet, and an actual number — the walkthrough for
    this one is a phone, not a query.

  - **Next:** #91/#92 (remembering substitutions, persisting comparisons)
    are explicitly out of scope per #90's own text — this is ephemeral,
    computed fresh on every press, on purpose.
