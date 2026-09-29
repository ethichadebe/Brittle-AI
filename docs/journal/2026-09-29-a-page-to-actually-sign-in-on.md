# 2026-09-29 — Testing the untestable, and one gap that was mine, not the plan's

- **Asked for:** live-test #82-#85 before continuing. #82 and #83 checked
  out on the deployed app. #84 and #85 could not be tested at all — there
  was no sign-in page.
- **Worked first time:** the gap was found correctly the first time; the
  fix was a deliberate, small addition rather than something in the original
  issue list.
- **Laptop needed:** no.
- **Friction:**

  - **#84 and #85 were both scoped, correctly, as backend-only.** The
    issues said so explicitly — "credential only", "not yet wired to
    lists" — and the automated test suites proved the logic. But nothing
    in either issue, or in #86 which is next, gives a shopper an actual
    button to press. Verifying "signing in claims your lists" on a live
    app requires signing in to exist as a clickable thing first. That gap
    was mine to flag, not the user's to discover by hitting a dead end.

  - **Given the choice, added a minimal sign-in page rather than pushing
    past the gap.** One route (`/account`), reusing existing CSS classes
    (`.settings-row`, `.modal-input`, `.btn`) rather than inventing new
    visual language for one page. A shared `useAccountSession` hook so
    Settings and the Account page can't disagree about whether the shopper
    is signed in — each fetching its own copy was the obvious first draft
    and the more error-prone one.

  - **The frontend was silently discarding the backend's own error
    message.** `api.ts`'s `request()` threw `Error(`${status}
    ${statusText}`)` on any non-2xx response — so a wrong password would
    have shown "401 Unauthorized" instead of #84's "Invalid email or
    password". Fixed with an `ApiError` that reads the response body's
    `error` field first. Mutation-checked: disabling that extraction made
    the dedicated test fail on the exact string it exists to catch, not a
    generic assertion.

  - **`routeTree.gen.ts` needed regenerating by hand.** It's produced by
    the TanStack Router Vite plugin as a side effect of `vite build` or
    `vite dev`, not by a dedicated codegen command — `tsc` alone (which
    `typecheck` and the first half of `build` run) never touches it, so
    adding a route file and running `typecheck` first just failed with
    "not assignable to keyof FileRoutesByPath". One `vite build` run
    updated it before typecheck was retried.

  - **No component-level test for the Account page itself.** This repo's
    frontend suite is pure-logic-only — `summary.test.ts` and now
    `api.test.ts` — with no jsdom or testing-library dependency and no
    other route component tested either. Matched that convention rather
    than introducing new test infrastructure for one page; the page's own
    correctness is what the live walkthrough is for.
