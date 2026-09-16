# 2026-09-16 — Make the agent-skill config match reality

- **Asked for:** run `/setup-matt-pocock-skills` and clean the repo up to conform to the workflow.
- **Worked first time:** yes, but the interesting part was that the setup had already been run — `docs/agents/` and the `CLAUDE.md` block both existed. Checking them against the live repo rather than taking them at face value is what found the problems.
- **Laptop needed:** no.
- **Friction:**
  - `docs/agents/issue-tracker.md` told every skill to shell out to `gh`. `gh` is not installed in a cloud session, and cloud sessions are now the normal way this repo gets worked on under Mobile Delivery — so `/triage`, `/to-issues` and `/to-prd` would have failed on their first command. The doc now names both paths, says to check which one is present, and refuses to invent a fallback.
  - Writing that doc turned up a trap worth recording: the MCP `issue_write` call **replaces** the whole `labels` array, while `gh issue edit --add-label` appends. Triage logic written against `gh` silently drops labels when run through MCP. Every tool name, method and enum in the new doc was checked against the live schemas instead of written from memory — which is exactly what the old doc had not done.
  - `.agents/skills/` and `.claude/skills/` were byte-identical copies of the same 14 skills, 34 files each, both added in `c6aef13`, and nothing in the repo referenced `.agents/`. Removed the duplicate. The cost was never the disk space, it was drift: two copies means a skill edit lands in one and not the other.
  - The other two config files were already correct, and confirming that took longer than fixing the broken one. All five triage labels really do exist on the repo with the canonical names, and the single-context layout really does match how `packages/types` shares one vocabulary across frontend and backend.
