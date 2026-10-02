# 2026-10-02 — Redesign 7/9 and 8/9: compare sheet, intro slides and hints

- **Asked for:** #116 (restyle the compare sheet, behaviour unchanged) and
  #117 (three intro slides for a first visit, and one-off hints on a
  list), together.
- **Worked first time:** yes. The screenshots caught one thing: the store
  picker's tiles were the same colour as the sheet behind them, so they
  didn't read as buttons.
- **Laptop needed:** no.
- **Friction:**

  - **The compare flow moved into its own component.** Sign-in prompt,
    store picker, the wait, errors and the results sheet were all inline in
    the list screen. It's now `CompareFlow`, with its logic moved as it
    was. "No change in behaviour" was checked by a browser run of every
    branch earlier slices built: the three badges, untick and re-tick,
    picking and un-picking a suggestion, "You removed … Undo" re-comparing,
    the incomplete note, a server error and the signed-out prompt. Every
    decision sent to the server matches.

  - **The intro skips anyone already using Accucery here.** "First visit"
    is a per-device flag nobody has yet, so without this every existing
    shopper, the owner included, would meet a welcome tour the day it
    shipped. A device with lists, or a signed-in account, never sees it;
    to see it, use a private window.

  - **Hints count as seen when you do the thing.** Ticking an item retires
    "Tap the circle…"; deleting one retires "Swipe left…". They show one
    at a time, under the first item.

  - **Earlier browser checks met the intro.** Fresh test "devices" now get
    the slides, so the home and New list checks mark them seen first; the
    intro has its own checks.

  - **Mutation-checked:** forgetting the intro was dismissed, showing it to
    an existing shopper, and counting an unticked Substitute in the total
    each fail the check meant for them.

  - **Next:** #118, making it installable (PWA), then the parked issues.
