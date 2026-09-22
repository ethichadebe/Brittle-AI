# 2026-09-22 — Every list gets an owner, and old ones get none

- **Asked for:** build #82, the first issue from the accounts grilling —
  give every Shopper a private, per-device identity, closing the leak where
  any visitor can see and edit anyone else's lists.
- **Worked first time:** yes, on the second attempt at the test harness.
- **Laptop needed:** no. Postgres 16 was already in the container.
- **Friction:**

  - **The existing db tests broke the moment ownership was enforced, and
    that was the point.** `listItems.db.test.ts` created lists with no
    owner and called `app.inject()` with no cookie on every request — which,
    once GET/POST/PATCH/DELETE all check `userId`, is indistinguishable from
    a stranger poking at someone else's list. Fixed by giving that file one
    fixed device identity for its own device-scoped `inject()` wrapper, since
    those tests are about item CRUD, not ownership itself.

  - **Ownership tests belong in their own file.** `lists.db.test.ts` is new,
    and every test in it is a two-device scenario on purpose — Alice creates,
    Bob is refused. A one-device test cannot prove ownership is enforced; it
    can only prove the happy path still works.

  - **Mutation-checked the shared guard, not each route individually.**
    Dropped `userId` from `findOwnedList`'s `where` clause and re-ran the db
    suite: "cannot be deleted by a different device" failed with 204 instead
    of 404, "cannot have items added" failed with 201 instead of 404. Both
    named exactly the breach they exist to catch. Reverted and confirmed
    green again before moving on.

  - **`prisma.list.findFirst({ where: { id, userId: deviceId } })` needed no
    special case for the pre-existing unowned lists.** Their `userId` is
    `null`, which matches no device's UUID, so they fall out of every query
    for free — no `IS NOT NULL` branch, no migration script, nothing to get
    wrong. Confirmed rather than assumed: a dedicated test creates an unowned
    list directly in the test database, asks for it from a fresh device, gets
    404, then checks the row is still there.

  - **The identity itself is unsigned on purpose, and that is written down
    in the code, not just here.** The id space is a v4 UUID — forging
    someone else's means guessing 122 bits, not tampering with a signed
    value — so this stays unsigned rather than adding a secret this repo
    would then have to guard for no real gain.

  - **CORS needed one line changed, easy to miss.** The device-id cookie has
    to survive the round trip for any of this to work, and `credentials:
    true` cannot be combined with a wildcard CORS origin. `FRONTEND_URL` was
    already a specific origin rather than `*`, so this was safe to add
    without changing what the app accepts.

  - **Not done here, flagged for whoever picks up #85/#86:** claiming
    anonymous lists at sign-in, and the same-name-same-store collision
    prompt, both need this device identity to exist first. It now does.
