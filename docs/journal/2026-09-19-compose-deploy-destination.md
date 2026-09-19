# 2026-09-19 — Point the compose file at images instead of building on the box

- **Asked for:** steps 3, 4 and 5 of
  `ethichadebe/workflows/docs/compose-destination.md`, for the app named
  `accucery`. Explicitly **not** steps 1 and 2 — those belong to the workflows
  repo and the server.
- **Worked first time:** yes, but two things in the spec's example needed
  changing rather than copying.
- **Laptop needed:** no.
- **Friction:**
  - **The spec's example workflow fires on `branches: [main]`.** This repo's
    default branch is `master`, so a literal copy would never have fired and the
    first symptom would have been a merge that silently did nothing. Changed,
    with a comment saying why so the next reader does not "fix" it back.
  - **Verified the shared workflow rather than trusting the doc.** Fetched
    `compose-deploy.yml` and confirmed the input names (`app`,
    `backend-dockerfile`, `frontend-dockerfile`), that `build-context` defaults
    to `.` — which is what both Dockerfiles expect — and which secrets it
    actually reads. Its own header comment happens to use `app: accucery`.
  - **Merging this kills the old deploy path, and the files staying does not
    change that.** `docker-compose.prod.yml` is in `auto-deploy.sh`'s
    `NEEDS_BUILD` trigger list, so the next timer tick after a merge runs
    `docker compose up -d --build` against a file with no `build:` blocks and an
    unset `BACKEND_IMAGE`. That fails. It fails *softly* — `fail` leaves the
    previous containers running, so the site stays up — and then goes quiet,
    because the checkout has already fast-forwarded so later ticks see nothing
    to do. Keeping `auto-deploy.sh`, the service and the timer on disk was
    requested and is right, but they are a rollback path that needs the compose
    file reverted, not a working second route.
  - **Could not check which repository secrets exist.** No tool here exposes
    them. What is measurable: the existing `ci.yml` references zero secrets, and
    `/opt/accucery/.env` still holds literal `"..."` for the Telegram values, so
    the likeliest state is that all four are missing. Listed in the PR as
    unverified rather than asserted.
  - **Nothing was touched on postgres.** The `postgres` service and the
    `postgres_data` volume are byte-identical in the diff, which was checked
    rather than assumed — the whole point of the new path is that a deploy never
    recreates the database.
