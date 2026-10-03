# 2026-10-03 — A Pick n Pay list priced at your nearest store (#135)

- **Asked for:** #135, the Pick n Pay version of #131. Nothing new to
  grill: the switch on New list, "Use my location", and the Joburg default
  when location is declined all work as they do for Checkers.
- **Worked first time:** yes. Not yet seen against the real Pick n Pay;
  the deploy shows it.
- **Laptop needed:** no.
- **Friction:**

  - **Most of it already existed.** #132 made Pick n Pay price at any store
    code, and #131 and #134 built the location screens and the background
    lookup. What was missing was finding the store nearest a shopper.

  - **The address problem.** Pick n Pay finds a store from an address on
    its anonymous cart, and refuses an address with no street (#66). A
    phone gives only coordinates.
    - The coordinates are what pick the store: the cart's address uses the
      shopper's own point, with the nearest of the nine probe towns' name
      and postcode and a placeholder street ("1 Main Road").
    - None of it is kept: only the store, as before (POPIA).
    - Whether Pick n Pay accepts the placeholder street is the one thing
      the stand-ins can't show. If it refuses, the list says "couldn't reach
      the store" and stays on the default, which is a visible, harmless
      failure.

  - **No "out of delivery" for Pick n Pay.** Its cart always assigns some
    store, so a lookup never answers "none".

  - **Mutation-checked:** sending the default Sandton address instead of
    the shopper's coordinates fails the test.
