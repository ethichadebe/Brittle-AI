# 2026-09-22 — Adding milk twice adds up milk, not rows

- **Asked for:** build #83 while #93 (per-device identity) waited on CI/merge
  — merging a duplicate item into the existing row instead of creating a
  second one.
- **Worked first time:** yes.
- **Laptop needed:** no.
- **Friction:**

  - **The mutation check caught the defect on the first assertion, not the
    row count.** Disabling the lookup made `POST` always create, and the
    test failed on `statusCode` (201 instead of the merge's 200) before it
    ever reached the `toHaveLength(1)` line. That is still the right proof —
    it failed *because* a duplicate row was created, which is what the test
    exists to catch — but it is a reminder that an early assertion can mask
    a later, more specific one from ever running. Left the ordering as is,
    since seeing the wrong status code first is itself informative.

  - **`isChecked` had to be left out of the update, not merely defaulted.**
    The natural way to write a Prisma update is to list every field; the
    field that must be *absent* rather than explicitly re-set is the one
    that would have been easy to get wrong silently — a merge that quietly
    unchecked something the shopper had already ticked off would have looked
    like a working feature in every test that did not check a checked item.

  - **Not built here, and said so rather than left implicit:** there is no
    database-level unique constraint on `(listId, productId)`, so two
    near-simultaneous `POST`s for the same product could still race past
    the `findFirst` and create two rows. #83's acceptance criteria do not
    ask for that guarantee, and adding it pulls in a migration and
    transaction semantics beyond this issue's scope — but it is a real gap,
    worth its own issue if it is ever observed rather than assumed away.

  - **Ready to push the moment #93 merges.** Built and fully checked against
    current `master` while #93's CI ran, rather than idling — everything
    here is independent of that PR's diff (different behaviour in the same
    file), so there is nothing to redo once it lands, only a rebase.
