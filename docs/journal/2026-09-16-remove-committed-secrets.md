# 2026-09-16 — Remove committed secrets from the repo

- **Asked for:** clean the repo up to conform to the workflow. The first thing found was `env.prod`, tracked in a public repo with real credentials in it.
- **Worked first time:** yes. `env.prod` is referenced by nothing — not `docker-compose.prod.yml` (which reads Compose's default `.env`), not the README (which documents `cp .env.example .env`), not any script. It was a stray file someone filled in once and committed, wired to nothing, so untracking it breaks no deploy path.
- **Laptop needed:** no for the repo change. Yes for the part that actually matters — rotating the exposed credentials, which only someone with access to those accounts can do.
- **Friction:**
  - The `.gitignore` had `*.env`, which looks like it covers environment files but matches `foo.env` and **not** `env.prod`. The file sailed straight past it on 2026-05-17 and sat in a public repo for about four months. Patterns rewritten to `.env`, `.env.*`, `env.*`, `*.env` with `!.env.example` so the documented template stays tracked; verified against `env.prod`, `.env.local`, `.env.production`, `prod.env` and `.env.example`, and checked that no currently-tracked file becomes ignored.
  - **Untracking does not undo the exposure.** The values are still in git history, on a public repo, and in any fork or clone taken since May. The credentials have to be rotated at source — that is the fix; this commit only stops it getting worse.
  - Onboarding added "never put keys or secrets in this repo" to `CLAUDE.md` two pull requests ago. The rule was already being broken when it was written. Nothing checks it — a secret scanner in CI would have caught this in May.
