# 2026-09-30 — Suggest alternatives only for the items that weren't found

- **Asked for:** a live report on #101's own fix (merged same day): rarity
  weighting fixed the chips/chutney mismatch, but the accompanying
  "refuse below a minimum score" rule made the whole feature feel broken —
  items that used to at least show *something* now just disappeared.
- **Worked first time:** no — took two passes in the same pull request.
  The first pass (below) over-corrected: it replaced every matched item's
  single Substitute with a 3-option picker, not just the ones that were
  actually unmatched. Caught before merging, on a direct correction: keep
  #101's confidence cutoff and single auto-pick for a real match; only
  offer alternatives for the ones that come back "not found".
- **Laptop needed:** no.
- **Friction:**

  - **First pass conflated two different problems.** "Rank candidates
    better" and "auto-pick-or-refuse is the wrong shape" are separate
    ideas; the first attempt removed the confidence cutoff entirely and
    turned *every* matched item into a 3-way picker, on the reasoning that
    the shopper should always get to choose. That wasn't what was asked —
    a confidently found Substitute should just be shown, no picker, the
    same as before #101 broke it. The picker belongs only to the case that
    used to be a dead end: nothing confident enough to auto-apply.

  - **The corrected shape keeps both #101's ideas and adds a third.**
    `matchItem` ranks candidates by rarity-weighted word overlap (#101),
    picks and auto-applies the top one when its score clears the same
    confidence cutoff (#101) — one Substitute, no picker, on the common
    path. Below that cutoff, instead of refusing outright, it now returns
    `matched: false` *with* up to 3 ranked candidates attached as
    suggestions — offered, never auto-applied, since the whole reason
    they didn't clear the cutoff is that the algorithm isn't confident
    they're right.

  - **A suggestion has to be priced the same way a real Substitute is, or
    picking one is meaningless.** Suggestions carry the same Unit-Price-based
    `cost` a confident match's Substitute does (`ComparisonSuggestion`,
    computed in `compareList` off the same recovered "needed base units"
    math #90 introduced) — so picking one client-side is a straight re-sum,
    the same mechanism the exclude-checkbox already used, not a second
    round trip.

  - **Picking a suggestion counts it immediately.** Confirmed directly
    rather than assumed: once tapped, a suggestion behaves exactly like an
    already-included matched item from that point on. Tapping the same one
    again un-picks it, back to plain "not found".

  - **The pack-size dimension check still excludes outright, never
    downgrades to a suggestion.** A milk-powder candidate for liquid milk
    is dropped before ranking is even considered — there's no such thing
    as "a low-confidence but valid" comparison between grams and
    millilitres, only a meaningless one every time.

  - **Next:** live-test a third time. This is the second correction to the
    same report, and the actual answer to "does this read right on a
    phone" is still only available from a live list.
