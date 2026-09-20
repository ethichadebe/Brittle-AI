# 2026-09-20 — Get the backend suite running in CI

- **Asked for:** split the pure backend tests from the ones that need Postgres
  so the pure ones can run in CI today, then get the database ones running too.
  `.github/workflows/` was explicitly in scope.
- **Worked first time:** yes, with one failure along the way that was worth
  having — see below.
- **Laptop needed:** no. This is the first change in this repo where the agent
  ran the whole thing it was shipping, including the database tests.
- **Friction:**

  - **The cloud container already has Postgres 16 installed.**
    `/usr/lib/postgresql/16/bin/postgres`, cluster `16/main` present and
    stoppable with `pg_ctlcluster`. Nobody had checked. That turns the entire
    backend suite from "a person has to run this" into something verifiable
    here in about three seconds, and it is why the split below could be proved
    rather than argued for. Written up in `docs/agents/automation.md` so the
    next session does not re-derive it.

  - **The brief's split was one file off, in the useful direction.** It said
    two files touch the database, `priceCache.test.ts` and `env-wiring.test.ts`,
    and that splitting would get roughly 60 tests into CI. Measured: exactly one
    file touches it, `listItems.test.ts`. `priceCache.test.ts` mocks `../db.js`
    outright and `env-wiring.test.ts` only reads files off disk — the string
    `DATABASE_URL_TEST` appears in it as the name of a variable to *exclude*.
    So it is 71 tests into CI, not 60, and the database job carries 8 rather
    than the expected two files' worth.

  - **What was actually blocking the pure tests was the config, not the code.**
    `globalSetup` opened a Prisma connection before any test file ran, so a
    scraper parsing test could not run without a database it never touched.
    Both suites now have their own config, and `*.db.test.ts` is the naming
    convention that decides which one a file lands in. `npm run test -w backend`
    still runs both, so a new test file cannot be silently skipped locally.

  - **`vitest.config.ts` with two `projects` failed on the first run**, because
    both inherited the package name and Vitest requires project names to be
    unique. Worth recording because it failed *loudly* at startup — the failure
    mode this repo actually fears is the opposite one, where a config quietly
    runs nothing.

  - **Mutation-checked both suites, and the database one had a hole.**
    Breaking `isFood` in `woolworths.ts` fails the pure suite by name, with
    Postgres stopped. Breaking the `DELETE ... 204` fails the database suite.
    But changing `GET /lists/:id/items` to answer a missing list with `200 {
    items: [] }` instead of `404` left all 7 tests green: the 404 test that
    exists covers `POST`, not `GET`. Added the missing case, confirmed it fails
    naming that branch, restored, confirmed it passes. That is 79 tests now,
    not 78.

  - **The shared `node-checks.yml` cannot host the database job.** It takes
    `install`, `lint`, `test` and `build` and nothing else — no `services:`
    input — so `backend-db` is written out longhand in `ci.yml`. Checked the
    shared workflow rather than assuming; it is a public repo and readable from
    here. Two jobs also means the pure suite still reports if the database job
    fails to start, which the single-job alternative would not.
