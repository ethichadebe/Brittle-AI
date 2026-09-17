# 2026-09-17 — One probe script instead of a third copy

- **Asked for:** move on to the next store. SPAR was the pick — it is the only
  remaining shop people do a weekly grocery run at, and the probe-first habit is
  what makes it cheap to try the risky one.
- **Worked first time:** yes, but nothing has been probed yet. This is the
  script, and it stops there, as it did for Shoprite and Woolworths.
- **Laptop needed:** yes, for running it. This session cannot reach any store.
- **Friction:**
  - `probe-shoprite.sh` was copied into `probe-woolworths.sh`. A third copy for
    SPAR would have been two files to keep in sync, then three, and CLAUDE.md
    already says what this project thinks of byte-identical copies. The question
    was identical every time — what platform is this, and does a parser we have
    fit it — so the host is an argument now: `probe-store.sh <url> [query]`.
  - `probe-woolworths.sh` is deleted rather than left beside it, because it *is*
    this script with one host hardcoded. `probe-woolworths-search.sh` stays: it
    asks Woolworths-specific questions about price zones and the promotion
    facet, and issue #28 still points at it.
  - Every fix the Woolworths rounds earned is carried over rather than
    re-learned: the fingerprints match substrings, since `ac.cnstrc.com` missed
    Woolworths and printed "none recognised" directly above a host list
    containing `cnstrc.com`; records are pipe-separated, since `content_type`
    contains a space; the credit counter is a file, since `fetch` runs inside
    `$( )` and a variable would die with the subshell; the WAF verdict comes
    from the direct attempt, not from whatever finally answered; api paths are
    truncated before de-duplicating; and the closing notes print only to a
    terminal, so piping the output into `sed` or `awk` can never surface prose
    that matches the pattern being grepped. All six were bugs found by running
    the thing, not by reading it.
  - Two fingerprints added from what the last store taught: `klevu` and
    `shopify`, alongside `algolia`, `searchspring`, `unbxd` and `bloomreach`.
    The list is cheap to extend and the cost of a miss is a false "none
    recognised", which is the one failure mode that wasted a whole round.
  - Step [5] now measures a captured response against **both** parsers and
    prints all keys, not a keyword-filtered subset. Woolworths' price lived in
    `p10`/`p30`/`p60` and no key contained the word "price", so a guessed word
    list would have found nothing — and did, for two rounds.
- **Not done, deliberately:** `pnp.ts` and `woolworths.ts` are both
  Constructor.io and share a request shape but not one price field. Extracting a
  `constructorGroup.ts` now would be premature; two is a coincidence. Wait for a
  third Constructor store, which is exactly how `shopriteGroup.ts` came about.
