# 2026-10-01 — Redesign 5/9 and 6/9: adding items, and Profile

- **Asked for:** #114 (an add screen that stays open while you add several
  products, with Recent) and #115 (one Profile page, and email-first
  sign-in), together.
- **Worked first time:** yes. One check was too weak: the tap-burst test
  passed because the button was greyed out, not because of the guard.
  Rewritten to tap three times in the same instant, it now fails without
  the guard.
- **Laptop needed:** no.
- **Friction:**

  - **Two calls grilled before building.**
    - Email-first can't ask the server whether an email has an account.
      The server deliberately never says ("Invalid email or password"), so
      the Shopper says: the password step is "Sign in", with "New here?
      Create an account" switching it and keeping the email.
    - Recent isn't a tab. It sits under the empty search box, so the
      keyboard is already up and your usual products are one tap away;
      typing swaps them for search results.

  - **× undoes exactly what its + did.** A product already on the list is
    merged into its row by the server (#83), so × on that takes the one it
    added back off the quantity. It doesn't delete a row that was there
    before.

  - **The tap-burst guard (#98) became per product.** It used to block
    every tap while any add was in flight, which was right for a sheet
    that closed after one item. Now several products can be added at
    once, but one product can't be added twice by a burst of taps.

  - **Recent reads the lists you have now,** the same choice as #111's
    name chips. It's priced at the latest price seen, like a home-screen
    total. The endpoint is `GET /recent-products?store=`, scoped to the
    caller like every list route.

  - **Old links still land.** `/settings` and `/account` redirect to
    Profile. Signing in from a list's Compare returns to that list, and
    only ever to a page inside Accucery, so a crafted link can't send a
    freshly signed-in shopper elsewhere.

  - **Mutation-checked:** showing a product twice in Recent, ignoring the
    store, removing the tap guard, leaving before the list-collision
    question is answered, and letting `//elsewhere` through each fail the
    check meant for them.

  - **Next:** #116, the compare sheet's restyle.
