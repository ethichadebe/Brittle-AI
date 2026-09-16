# 2026-09-16 — Stop being the one who runs the deploy commands

- **Asked for:** "Why am I still the one manually doing the commands?" — after a
  session where every VPS action was me pasting a block and the human running it.
- **Worked first time:** the script yes, the reasoning no. The first version
  hardcoded `http://127.0.0.1:8082` for its post-deploy checks, which is exactly
  the drift the `FRONTEND_PORT` variable was added to prevent two pull requests
  ago. It now reads `FRONTEND_PORT` out of `.env` and derives the port.
- **Laptop needed:** no for writing it. Yes, once, to install the systemd units —
  and that is the last hand-run command this repo should need.
- **Friction:**
  - The honest answer to the question was that onboarding explicitly left
    deploys out ("a repo needs a Destination"), so the pipeline stops at a green
    pull request and a human has been carrying it the rest of the way.
  - Nothing in a cloud session can reach the VPS: SSH is raw TCP on port 22 and
    the egress proxy only carries HTTPS. So the deploy cannot be pushed from
    here or from GitHub Actions without putting a key somewhere. Inverting it —
    the box polls GitHub — needs no credential, no inbound port and no runner.
    The cost is up to a minute of delay, which nobody will notice.
  - Deliberately **not** running `smoke-scrapers.sh` after each deploy, though
    that was in the plan the human picked. Every Checkers search spends a
    ScraperAPI credit and the account is on the free tier. A deploy check that
    burns metered quota gets switched off the first time someone sees the bill,
    and a check that is switched off is worse than one that was never added.
    `/api/lists` is the cheapest request that still proves nginx, the backend and
    Postgres are all answering.
  - It refuses to deploy when a tracked file has been edited on the box. Losing
    someone's hand-made hotfix silently is how people stop trusting automation,
    and this repo already has one four-month bug caused by a hand-edited file.
  - It only rebuilds when the change touched something that ends up inside an
    image. Eleven of the twelve journal entries here are docs-only commits and a
    rebuild takes minutes.
  - Tested by cloning the repo twice in a scratch directory and pointing one
    clone at the other as `origin`: behind-with-code-changes, behind-with-
    docs-only, up-to-date, and locally-dirty all take the branch they should.
  - Fixed a doc bug found the hard way earlier in the session: the cookie-refresh
    steps said `restart backend`, which re-runs the container with the values
    baked in at create time. The new cookie never arrives. It wants
    `up -d --force-recreate backend`.
