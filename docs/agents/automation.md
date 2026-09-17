# Automation: what an agent session can reach, and how

This exists because of a specific, repeated cost. On 2026-09-17 shipping two
store scrapers took roughly thirty rounds of a human copying terminal output
from a phone into a chat window. Most of those rounds carried no decision — the
agent needed to *see* something, and a person was the only wire.

Read this before deciding to ask a human to run something.

## The constraint, stated plainly

A Claude Code cloud session is a container with an egress proxy in front of it.
Two things follow, and both have been tested rather than assumed:

- **It cannot reach the VPS.** There are no SSH credentials in the session, and
  the proxy refuses HTTPS to the app's own domain outright
  (`connect_rejected — the egress proxy denied the CONNECT (organization
  policy)`). There is no workaround from inside the session.
- **It cannot reach the store sites.** Every probe in `scripts/` is written to
  be run by a human on the VPS for this reason. This is not a nuisance to
  engineer around; it is why the probe-first discipline exists at all.

So: **every observation of the live system arrives through a person.** Design
for that instead of forgetting it each time.

## The working rule

> When the only way to see a result is another person's terminal, the cost of
> shipping an untested version is not one round trip — it is their attention.
> Build the fixture first.

Concretely, before asking anyone to run anything:

1. Write a stub or fixture that makes the thing runnable offline, here.
2. Run it. Then break the thing it covers and run it again, and check it fails
   *naming* what broke. A test that passes against a broken script is worse
   than no test — that is how `SCRAPERAPI_KEY` ended up printed in probe output.
3. Only then hand over a command.

Both `scripts/report.test.sh` and `backend/src/scraper/env-wiring.test.ts` were
written this way, and both were verified by deleting the fix.

## The channels that do exist

| Channel | Direction | Use it for |
| --- | --- | --- |
| The git repo | agent → VPS | Code. The only path that deploys. |
| GitHub issues and PRs | both ways | Decisions, findings, anything durable. See `docs/agents/issue-tracker.md`. |
| `scripts/report.sh` | VPS → agent | Command output, without hand-relaying it. |
| A person pasting output | VPS → agent | The fallback. Assume it costs more than it looks. |

## `scripts/report.sh`

Runs a command on the VPS and posts its output as a comment on a GitHub issue,
which the agent session can then read directly.

```
bash scripts/report.sh <issue-number> -- <command...>

bash scripts/report.sh 35 -- bash scripts/probe-store.sh https://www.game.co.za
bash scripts/report.sh 27 -- env QUERIES=milk STORES=woolworths bash scripts/smoke-scrapers.sh
```

It prints a preview before posting, passes the command's exit status through,
and truncates at 50KB (`REPORT_MAX_BYTES`).

### Setting it up

One value in `/opt/accucery/.env`:

```
GITHUB_REPORT_TOKEN=
```

Make it a **fine-grained personal access token limited to this one
repository**, with **Issues: read and write** and nothing else. Specifically
*not* Contents and *not* Workflows: this box has no reason to push code, and a
token that can only comment cannot be turned into a deploy if the VPS is ever
compromised.

### Why it is so careful about output

**This repository is public.** Every comment it posts is world-readable and
permanent, and GitHub keeps the text even if the comment is later deleted. So
it assumes the next leak is accidental, because the last one was:

1. Every value in `.env` of 8 characters or more is masked, whatever the key is
   called, longest first. That is the strong guarantee — a secret cannot be
   posted unless it is absent from `.env`, in which case it is not this box's.
2. Credential *shapes* are masked even when they never appear in `.env`:
   `api_key=`, `token=`, `password=`, `secret=`, `Bearer `.
3. If anything still looks like a private key, a GitHub token or an AWS key ID
   after all that, it **refuses to post at all** and leaves the file on disk,
   rather than posting something almost clean.

What it cannot do is recognise a secret in a form `.env` does not hold —
url-encoded, base64'd, or split across lines. It is a second line of defence,
not the first. Only point it at commands already written to print no secrets;
the probe scripts and `smoke-scrapers.sh` each say so at the top.

A side effect worth knowing: a short, ordinary `.env` value such as
`NODE_ENV=production` is 10 characters, so the word `production` gets masked
wherever it appears. That is the threshold doing its job, not a bug. The
preview shows you what will be posted before it goes.

### Testing it

```
bash scripts/report.test.sh
```

No network, no GitHub, no real `.env` — it copies the script into a temp
directory with a planted secret and a stubbed `curl`, and asserts the secret is
absent from the bytes that would have gone over the wire. Run it after any
change to the redaction.

## Two structural fixes that would remove the constraint

Neither has been done; both are the user's call, and both are larger than a
pull request.

- **A private companion repo for agent reports.** `report.sh` posts to a public
  repo, so its redaction has to be airtight. A private ops repo would make the
  blast radius of a miss much smaller. Added to a session with `add_repo`.
- **Widening the environment's egress policy** so a session can reach the app's
  own domain. That would let an agent verify a deploy without asking anyone.
  Environment configuration is documented at
  <https://code.claude.com/docs/en/claude-code-on-the-web>.

Until one of those happens, the rule above stands: build the fixture first.
