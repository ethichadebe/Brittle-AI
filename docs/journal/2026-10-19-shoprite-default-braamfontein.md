# 2026-10-19 — Shoprite's default branch moves to Braamfontein

- **Asked for:** the owner's report that, with location off, search misses products such as "yum yum" (#196).
- **Cause:** found from the server, in four runs, without guessing at code:
  1. **`scripts/diag-search.sh`** (read-only, no credits) showed what was kept:
     - Checkers' default branch and Pick n Pay both found Yum Yum.
     - Shoprite was searched 16 times across 8 lists, but only a branch from a location had kept a result.
  2. **Its second run** showed Shoprite's default branch answers searches (68 kept, one failure in four days). It just never had Yum Yum.
  3. **`scripts/probe-shoprite-branch.mjs`** (about 4 credits) put them side by side:
     - "yum yum": 0 products at the default, 9 at Shoprite Zola.
     - "peanut butter" at the default: only premium brands (Simple Truth, Eat Naked), not Shoprite's everyday range.
     - The default, looked up from Sophiatown, was a store with a different range.
  4. **The owner chose** the nearest point between Braamfontein and Sandton. The probe tried four points with the app's own branch finder:
     - **Braamfontein** lands on **Shoprite Mayfair** and finds all 9.
     - Parktown, Rosebank and Sandton have no delivering Shoprite at all.
- **What changed:**
  - Shoprite's default place is Braamfontein.
  - The saved default branch is now kept under a key naming its place (`default-branch:Shoprite:Braamfontein`). A moved place takes effect on deploy, not when the old branch's week runs out.
  - Checkers' key gains its place too (`…:Sandton`), so it looks its default up once more after deploy. That's a couple of credits for the same answer.
  - The probe reads the new key.
- **Worked first time:** yes.
  - Tests check that Shoprite's default is asked from Braamfontein, and that a branch kept under the old key is never read back.
  - Putting Sophiatown back, or the old key, fails them.
- **Laptop needed:** no.
- **Friction:**
  - The cloud session can't reach Shoprite, so every observation came through the owner running a command on the server. The read-only check went first, then the probe, so only about 20 credits were spent.
  - Not changed: a branch is accepted when a search for "milk" finds something, and that test passed the premium store. A branch's range isn't judged.
