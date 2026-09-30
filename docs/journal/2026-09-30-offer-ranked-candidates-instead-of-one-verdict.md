# 2026-09-30 — Offer up to 3 ranked candidates, not one verdict

- **Asked for:** a live report on #101's own fix (merged same day). Rarity
  weighting fixed the chips/chutney mismatch, but the accompanying "refuse
  below a minimum score" rule made the whole feature feel broken — items
  that used to at least show *something* now just disappeared. Asked for
  up to 3 close candidates instead, so the shopper can pick the right one
  or the next-best, rather than trusting a single algorithmic verdict.
- **Worked first time:** yes on the shape; several existing tests needed
  rewriting to match the new contract, expected for a change this size.
- **Laptop needed:** no.
- **Friction:**

  - **The threshold from #101 was the wrong half of that fix, in hindsight.**
    Rarity weighting (ranking) is genuinely useful and stays; refusing
    outright below a score cutoff was the part that turned "an imperfect
    match" into "nothing at all" for any item where nothing scored well —
    which, per #101's own journal note, was already flagged as a known
    limitation of a single-candidate reproduction. This report is that
    limitation showing up live, sooner than expected. The actual fix isn't
    a better cutoff — it's not auto-deciding at all.

  - **"Matched" now means "found something to offer", not "found the
    answer".** `matchItem` returns up to `MAX_CANDIDATES` (3) ranked
    candidates rather than one auto-picked Substitute; the only remaining
    refusal is when literally nothing at the target store has a pack size
    that can be read and compared at all — the physical case, not a
    confidence judgment. A weak match is now surfaced as "here's the
    closest thing found", never hidden.

  - **Cost had to move from the item to the candidate.** Each candidate is
    priced against the shopper's own quantity the same way the old single
    Substitute was (recovering needed base units from the original's own
    Unit Price, per #90) — so picking a different candidate client-side is
    a pure re-sum, no second round trip, same principle #90 already used
    for excluding an item.

  - **The pack-size dimension check still excludes, not just ranks down.**
    A milk-powder candidate for liquid milk is still dropped entirely, not
    offered as option 3 of 3 — there's no such thing as "a worse but still
    valid" comparison between grams and millilitres, only a meaningless
    one. Proved by test with a real liquid candidate present alongside the
    powder one, so the exclusion is shown to work as one option among
    several, not just when it was the only candidate.

  - **Frontend UI:** the compare sheet's single Substitute line became a
    small list of tappable candidate rows per item, defaulting to the
    top-ranked one (highlighted), each showing its own price; tapping
    another re-sums the live total instantly, the same client-side
    recompute the exclude-checkbox already did.

  - **Next:** live-test again — this is a second attempt at the same
    report, and whether "show 3, let the shopper pick" actually reads
    better on a phone than either of the first two behaviors is itself an
    open question only a live list can answer.
