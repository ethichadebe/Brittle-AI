# 2026-09-22 — Claiming a list is not the same as the shopper seeing it

- **Asked for:** build #85 — signing in claims the device's anonymous
  lists, minus the colliding case (#86).
- **Worked first time:** no. The first version claimed lists correctly and
  the shopper still couldn't see them.
- **Laptop needed:** no.
- **Friction:**

  - **The gap wasn't in the issue's acceptance criteria, and had to be
    found rather than checked off.** #85 asks for `List.userId` to move
    from device to Account. It does not say what happens to `findOwnedList`
    and the list routes, which still scoped everything strictly to
    `req.deviceId`. Claim a list and its owner becomes the Account's id —
    which the device-scoped routes never match, so the shopper who just
    signed in sees zero lists. Correct data, invisible result: the exact
    shape of bug this project keeps finding late.

  - **Fixed with one function, not four call sites patched individually.**
    `ownerKey(req)` returns `req.accountId ?? req.deviceId`, and every place
    that used to read `req.deviceId` for ownership now reads that instead.
    Signed out, nothing changes. Signed in, ownership follows the Account.
    One rule, not "remember to check accountId here too" scattered across
    `lists.ts` and `listItems.ts`.

  - **The mutation check that mattered was the collision guard, not the
    transfer.** Moving lists across is the easy half — creating two
    "Monthly" lists on one Account, or silently overwriting the one already
    there, is the failure that would look fine in every test that didn't
    specifically build a collision. Disabled the guard and the dedicated
    test immediately produced two "Monthly" lists where there should be
    one — named exactly the defect.

  - **The round-trip through sign-out was worth checking rather than
    assuming.** A colliding list stays owned by the device, untouched. Does
    it become permanently unreachable once signed in? No — `ownerKey`
    falls back to `req.deviceId` the moment there is no session, and the
    device cookie is untouched by sign-out (#87 hasn't landed yet, and
    doesn't need to for this). So the colliding list is exactly as visible
    as before this issue touched anything: reachable while signed out,
    parked while signed in, waiting on #86's prompt to actually resolve it.

  - **Reused the sign-up path for sign-in's claim, deliberately, rather than
    writing two versions.** A brand-new Account from sign-up has no lists
    of its own, so the general collision-checking function just finds an
    empty collision set and claims everything — not a special case, the
    same code running with different data.
