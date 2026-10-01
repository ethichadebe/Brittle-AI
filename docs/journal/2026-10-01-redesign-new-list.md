# 2026-10-01 — Redesign 2/9: New list screen

- **Asked for:** #111, a proper screen for making a list, replacing the
  stop-gap dialog #110 left on the home screen.
- **Worked first time:** yes.
- **Laptop needed:** no.
- **Friction:**

  - **Two gaps grilled before building.** Which "names you've used before"
    to offer: the names of the lists you have now (no new storage, and they
    follow you across devices), so a deleted list's name stops being
    offered. And what the name starts as: the date, "Shop 1 Oct", so a list
    is always sensibly named and tells itself apart from last week's.

  - **No collision rules were needed.** The issue said "same as today
    (#86)", but #86 is about lists meeting when you sign in. Two lists may
    already share a name and a store, so making one never collides.

  - **The store is preselected only when there's something to go on:** the
    store of your newest list. A brand new shopper picks one; Create stays
    off and says "Pick a store to shop at" until they do.

  - **Back from a new list goes home, not to the form.** The form replaces
    itself in the browser history when the list is made, so the new list is
    there at the top of home.

  - **Mutation-checked:** letting a name be offered twice, and leaving the
    form in history, each fail the check meant for them.

  - **Next:** #112, the list screen itself.
