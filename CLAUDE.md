# Brittle-AI

## Mobile Delivery

This repository ships through Mobile Delivery: someone describes a change from their phone, you open a pull request, they merge, and it deploys itself. Follow this for **every** change, whether or not the request mentions it.

**Always:**

- Work on a branch and **open a pull request**. Never push to `master`, and never merge your own work — merging is the human's decision.
- **Run the checks before opening the PR**, so CI is not the first to find a problem. This is an npm workspaces monorepo, so install once at the repo root with `npm ci` and run every command from there:
  - `packages/types` — `npm run typecheck -w packages/types`, `npm run build -w packages/types`
  - `frontend` — `npm run typecheck -w frontend`, `npm run test -w frontend`, `npm run build -w frontend`
  - `backend` — `npm run db:generate -w backend` (Prisma client, needed before anything typechecks), `npm run typecheck -w backend`, `npm run build -w backend`, and `npm run test -w backend` when a Postgres test database is available
- **Add a change note** to `docs/journal/` in the same pull request: a dated file saying what changed, whether it worked first time, whether a laptop was needed, and anything that got in the way. See `docs/journal/README.md`.
- Keep the pull request description short and plain: what changed, and why.

**Never:**

- Put server addresses, IP addresses, keys or secrets in this repo.
- Edit anything in `.github/workflows/` unless the request is explicitly about the pipeline.
- Add a dependency without saying in the PR description why it is needed.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (uses the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
