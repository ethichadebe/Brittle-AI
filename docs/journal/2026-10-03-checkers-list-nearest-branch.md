# 2026-10-03 — A Checkers list priced at your nearest branch (#131)

- **Asked for:** #131, the first slice of location pricing (#66): a
  Checkers list priced at the shopper's nearest branch. Grilled before
  building:
  - **Asking:** a switch on New list, "Prices from your nearest Checkers".
    The browser's permission prompt only follows a tap, never a surprise.
  - **Next lists:** once the shopper says yes, later lists use their
    location without asking again.
  - **Older lists:** lists on the default get "Joburg prices · Use my
    location" under their name.
- **Worked first time:** mostly. Two lint findings on the list screen (state
  set inside an effect, and a handler named like a hook) and one test typing
  fix. Not yet seen against the real Checkers site; the deploy shows it.
- **Laptop needed:** no.
- **Friction:**

  - **How a list gets its branch.**
    - The phone reads its position only when the shopper asks, and sends it
      once, in a request body: `PUT /lists/:id/location`.
    - The server asks Checkers which stores serve that point, the same
      lookup #130 does for the default, and saves only the branch on the
      list, with its name. The coordinates are never stored, logged, or put
      in a URL (POPIA). A test checks the saved row for them.
    - A point outside South Africa is refused before Checkers is asked.

  - **Lists no longer share a price.**
    - Until now the price cache handed back the newest price of a product
      in any zone. With one branch per store that was harmless; with lists
      at different branches, one list would show another branch's price.
    - Reads for Checkers and Shoprite are now scoped to the list's own zone:
      the list screen, the refresh behind it, the home screen totals, and
      cached searches.
    - Woolworths is deliberately left unscoped, because one of its searches
      can land products in different zones.

  - **Searching as the list.** Adding items sends the list id, so the search
    runs at that list's branch. Someone else's list id gets the default, not
    their branch.

  - **The New list screen doesn't wait for Checkers.** Finding the branch
    can take seconds through ScraperAPI, so the list opens straight away.
    It shows "Finding your nearest Checkers…" and switches to the branch
    name when it's found. The position is never handed between screens;
    only the lookup in progress is.

  - **Mutation-checked:**
    - Reading prices from any zone fails the "two lists, two prices" test.
    - Ignoring the list in search fails the search test.
    - Storing the coordinates fails the privacy test.

  - **Seen in a browser** with a fake location and a fake Checkers, in
    light and dark: the switch, a refused permission, "Finding…", the branch
    name, and "Use my location" on an older list.

  - **Not here:** Shoprite (#134), Pick n Pay (#135), changing branch (#136),
    choosing by province (#137), compare at your branches (#138).
