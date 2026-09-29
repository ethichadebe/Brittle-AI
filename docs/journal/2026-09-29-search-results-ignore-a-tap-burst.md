# 2026-09-29 — A burst of taps on search results added every item touched

- **Asked for:** a live bug report, not a filed issue — in a list's search
  sheet, tapping several results in quick succession added all of them,
  instead of the first tap winning and the rest being ignored until it
  finished.
- **Worked first time:** yes.
- **Laptop needed:** no.
- **Friction:**

  - **`addItem` had no guard against being called twice before the first
    call resolved.** Each search result's `onClick` called `addItem`
    directly; nothing stopped a second tap from starting its own
    `api.items.add` while the first was still in flight, so a burst of
    taps became a burst of adds. Added one boolean, `addingItem`, set at
    the top of `addItem` and checked before anything else runs — a second
    call while one is already in progress is a no-op, not a queued add.
  - **The visible half matters as much as the guard.** A tap that
    silently does nothing still feels broken if the row looks tappable.
    Added a `search-results--busy` class while `addingItem` is true —
    `pointer-events: none` plus a dimmed opacity on every result row, so
    the list visibly stops responding the moment the first tap lands, not
    just after the fact.
  - **No test added.** This codebase's frontend suite is logic-only
    (`api.test.ts`, `summary.test.ts`) — no component-rendering test
    exists anywhere yet, and adding one now would mean pulling in a testing
    library dependency for a single guard clause. Verified manually
    instead: the fix is a one-line re-entrancy check, easy to read
    correct by inspection, and this is exactly the kind of interaction bug
    that is quickest to confirm by tapping the phone rather than
    simulating clicks.
