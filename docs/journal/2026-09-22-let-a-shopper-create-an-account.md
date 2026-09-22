# 2026-09-22 — Accounts, credential only, and no new dependency

- **Asked for:** build #84 — let a Shopper create an Account. Per ADR 0003,
  this is the credential itself: sign-up, sign-in, sign-out. Not yet wired
  to lists — that's #85.
- **Worked first time:** yes, on the second mutation check.
- **Laptop needed:** no. Postgres had gone down between sessions
  (container restart) — `pg_ctlcluster 16 main start` and recreating the
  `accucery`/`accucery_test` roles and databases took thirty seconds.
- **Friction:**

  - **No new dependency for password hashing.** Node's own `crypto.scrypt`
    plus `timingSafeEqual` does the whole job — salted, verifiable, stored
    as `"<salt hex>:<derived hex>"` in one column. `bcryptjs` or a native
    `argon2` binding were the obvious choices and both would have worked;
    this avoids adding a package (and its own supply chain) for something
    the standard library already does correctly.

  - **The mutation check that actually mattered was the enumeration
    guard, not the hashing.** Changed the sign-in route so an unknown email
    returned a different message from a wrong password — "No account with
    that email" versus the generic "Invalid email or password" — and the
    dedicated test caught it immediately, failing on exactly that
    difference. That is the one place in this issue where a passing test
    suite and a real vulnerability could otherwise have looked identical:
    every other test in the file would still have been green.

  - **The acceptance criterion on duplicate signup could not be met to the
    letter, and that is said plainly rather than smoothed over.** It asks
    for a duplicate-email failure "without revealing whether the email is
    registered to someone probing from outside." Properly closing that gap
    needs an email-verification flow — "if this address can be used, we've
    sent a link" — regardless of whether the account exists. Nothing in
    this codebase sends email yet, and building that infrastructure is not
    this issue's scope. Signup on a duplicate returns a plain 409 instead,
    which is what most consumer apps do and is a real, if standard,
    trade-off — not the same thing as having solved it.

  - **Every response is a hand-built object, never a spread of the Prisma
    row.** `toPublic()` exists so a `passwordHash` cannot leave this file by
    a `...account` shortcut someone adds later without reading why it isn't
    there already.

  - **Sessions are their own table, not a signed cookie.** The cookie holds
    only an opaque session id — the same shape as the device-id cookie
    from #82 — so a session can be revoked server-side (sign-out, and later
    #88's account deletion) without needing a token blocklist.

  - **`accountId` is optional on every request, and nothing downstream is
    allowed to treat its absence as an error.** Most routes still don't
    require an Account — #85 (claiming anonymous lists at sign-in) and
    #90 (comparing, which per ADR 0004 does require one) are what will
    start reading it.
