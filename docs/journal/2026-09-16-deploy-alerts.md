# 2026-09-16 — A log on the server is not a notification

- **Asked for:** "can I now prompt from my device and not need to connect to the
  VPS to handle deployments?" — nearly, and this is what was missing.
- **Worked first time:** yes, but only because it was checked against a real
  HTTP server rather than a real phone. A throwaway Python listener stood in for
  ntfy.sh and printed exactly what arrived, so the headers and body are known
  rather than hoped for.
- **Laptop needed:** no. One line in `.env` on the box and `--test-notify`.
- **Friction:**
  - Deploys already reported themselves — into `/var/log/accucery-deploy.log`,
    on the machine the whole point was to stop opening. A failed deploy was
    discoverable only by noticing the site was broken.
  - `--test-notify` exists because the alternative is installing this and
    finding out whether it works during the first real outage.
  - Failure buzzes, success is silent-but-recorded. A success alert that buzzes
    gets muted, and a muted channel carries no failures either.
  - The notifier cannot fail the deploy: ten-second timeout, errors swallowed,
    no retry. Verified by pointing it at a closed port mid-run — the deploy
    reached its normal exit with no delay.
  - The "tracked file edited on the box" case notifies too. It is not a failure,
    but it means deploys have quietly stopped, and quietly is the problem.
  - ntfy topic names are the only access control they have, so `.env.example`
    generates a random one rather than suggesting `accucery`. The URL lives in
    `.env`, never the repo.
- **Still not phone-only:** refreshing an expired store cookie needs real browser
  DevTools, and anything touching `.env` needs a shell. Those two are honest
  limits, not gaps to close.
- **Worth recording:** this was built without checking `ethichadebe/workflows`
  first, which already has a Destination mechanism — a deploy key locked to a
  dispatcher, with Candidate/Cutover and rollback (ADR 0004). Accucery is simply
  not registered in it. The timer here works, but it swaps a new version in
  where the house pattern would check it on a private port first. That gap is
  real and is not closed by this change.
