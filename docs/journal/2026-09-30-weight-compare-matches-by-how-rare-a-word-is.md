# 2026-09-30 — Weight Substitute matches by how rare a shared word is

- **Asked for:** not an issue — a live report. The compare feature (#90)
  matched "Simba ... Chutney Flavoured Potato Chips 120g" at Checkers to
  "Mrs H.S.Ball's Original Chutney 1.1 kg" at Woolworths: a jar of
  condiment, not a snack. Asked what could make match quality better.
- **Worked first time:** yes, on the approach; the numbers took a few
  passes to get right (below).
- **Laptop needed:** no — this is a pure scoring change, provably wrong or
  right from a canned catalogue, no live store needed.
- **Friction:**

  - **Plain word overlap can't tell a flavour from a product.** The chips'
    own name uses "Chutney" as a flavour descriptor; the jar's name uses it
    as what the product *is*. `nameSimilarity` (`matchItem.ts`) counted
    both as the same shared word, alongside "Mrs", "H", "S", "Ball's" — all
    from a brand line, all shared with more or less every jar in it — and
    that was enough to outscore any actual chip candidate the search
    returned.

  - **Fix is rarity, not smarts.** Nothing here knows what a "chip" or a
    "chutney" is. What it can know: across *this* search's own candidates,
    how many of them share a given word. A word most of the returned
    products have in common (brand, "flavoured") is weak evidence; a word
    only one or two candidates have is strong evidence. Weighting each
    shared word by `1 / (how many candidates contain it)` and scoring
    `Σ shared weight / Σ union weight` (rather than a flat token count) is
    what let the real chip candidate outrank the jars — worked through by
    hand on paper first, with three synthetic candidates modelling what
    Woolworths' own search plausibly returns for a "...Chutney..." query
    (two jars in the same brand line, one actual chip product), confirmed
    by test before touching the "why" comment.

  - **Rarity weighting alone doesn't catch every bad match — a floor
    does.** If nothing returned is actually similar, weighting still picks
    *something* — "least bad of a bad set" isn't good enough. Added a
    minimum score below which `matchItem` refuses rather than guesses, the
    same "won't guess" rule #89 already applies when pack size units
    aren't comparable, just applied to the name match itself. The
    threshold (0.3) was picked to sit just under the existing "different
    dimension" mutation test's own score (0.333) on purpose — raising it
    further to also catch some of the worst matches by hand would have
    started re-routing that test's refusal through the new threshold
    instead of the unit-dimension check it exists to prove is still there.

  - **Known limit, said plainly rather than hidden:** a single-candidate
    reproduction of the exact chutney/chips pair (only the wrong jar
    returned, nothing else) scores *above* this threshold on its own —
    rarity weighting needs more than one candidate to have anything to
    weight against. The real fix for that narrower case is a live search
    that returns better candidates in the first place, not a smarter
    scorer with nothing to compare. Left as-is rather than tuned further
    from a synthetic worst case with no live data behind it — the user
    plans to live-test this and will have real evidence either way.

  - **Next:** nothing queued — depends on what the live test shows.
