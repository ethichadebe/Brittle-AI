# Brittle-AI

## Mobile Delivery

This repository ships through Mobile Delivery: someone describes a change from their phone, you open a pull request, they merge, and it deploys itself. Follow this for **every** change, whether or not the request mentions it.

**Always:**

- Work on a branch and **open a pull request**. Never push to `master`, and never merge your own work — merging is the human's decision.
- **Run the checks before opening the PR**, so CI is not the first to find a problem. This is an npm workspaces monorepo, so install once at the repo root with `npm ci` and run every command from there:
  - everything — `npm run lint` (ESLint over all three workspaces from one flat config at the root)
  - `packages/types` — `npm run typecheck -w packages/types`, `npm run build -w packages/types`
  - `frontend` — `npm run typecheck -w frontend`, `npm run test -w frontend`, `npm run build -w frontend`
  - `backend` — `npm run db:generate -w backend` (Prisma client, needed before anything typechecks), `npm run typecheck -w backend`, `npm run build -w backend`, and `npm run test -w backend` when a Postgres test database is available
  - secrets — `gitleaks dir . --config .gitleaks.toml --redact --verbose`. CI runs this on every pull request and fails on a finding. If you do not have gitleaks installed, CI will catch it; it reports only the rule, file and line, so reproduce locally to see what tripped.
- **Add a change note** to `docs/journal/` in the same pull request: a dated file saying what changed, whether it worked first time, whether a laptop was needed, and anything that got in the way. See `docs/journal/README.md`.
- Keep the pull request description short and plain: what changed, and why.

**Never:**

- Put server addresses, IP addresses, keys or secrets in this repo. The `secrets` CI job enforces this; if it fires, fix the value, do not widen `.gitleaks.toml` to make it quiet. A genuine false positive gets a `gitleaks:allow` comment on the line, with a reason.
- Edit anything in `.github/workflows/` unless the request is explicitly about the pipeline.
- Add a dependency without saying in the PR description why it is needed.
- Silence a lint rule to get green. A deliberate exception gets an `eslint-disable-next-line` **with a `--` reason on the same line**, so the next reader knows why. Widening `eslint.config.js` hides the next one too.

## Agent skills

Skills live in `.claude/skills/` only. The `.agents/skills/` copy was byte-identical and has been removed, so each skill is edited in one place. If tooling recreates it, delete it again rather than keeping two copies in sync.

### Issue tracker

Issues live in GitHub Issues (`ethichadebe/Brittle-AI`). Use whichever access the session has — the GitHub MCP tools in a cloud session, `gh` on a laptop. `gh` is not installed in cloud sessions, so never assume it. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` — all five exist on the repo. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. Neither exists yet; `/grill-with-docs` creates them lazily, so their absence is not a defect. See `docs/agents/domain.md`.
