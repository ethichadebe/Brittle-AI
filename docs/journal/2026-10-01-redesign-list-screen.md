# 2026-10-01 — Redesign 3/9 and 4/9: list screen and item details

- **Asked for:** #112 (the list screen, built for shopping in-store) and
  #113 (an item detail sheet in place of the −/+ on every row), together.
- **Worked first time:** yes. The one failing check was the check itself,
  reading the total while it was still counting down.
- **Laptop needed:** no.
- **Friction:**

  - **Built as one PR.** The sheet is where quantity went when the rows
    lost their −/+, so neither made sense shipped alone.

  - **Ticking is instant.** The row moves into "In trolley" before the
    server answers. In an aisle, a tick that waits on a round trip feels
    broken; if the server refuses, the list reloads as it really is.

  - **The undo window needed guarding from #77.** While prices refresh,
    the screen reloads the items every few seconds, which would have put a
    just-deleted item straight back. Items in their undo window are now
    left out of every reload.

  - **One undo, two screens.** The home screen's delete-with-UNDO moved
    into a shared hook, so lists and items behave the same: one undo at a
    time, the delete happens when the bar goes or the screen closes, and a
    refused delete comes back.

  - **Small calls made without asking:**
    - The header's ⋮ holds Rename and a way to Settings (for loyalty
      cards), since the old ⚙ and ⇄ buttons are gone.
    - When the card is off, a row still says what it would cost with it
      ("R 31.99 with card"), as the old row did.
    - Compare is off for an empty list.

  - **Mutation-checked:** counting units instead of items in "1 of 4",
    letting UNDO's timer still fire, and putting an undone item back at the
    end each fail the check meant for them.

  - **Next:** #114, adding items.
