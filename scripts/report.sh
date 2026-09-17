#!/usr/bin/env bash
# Post a command's output to a GitHub issue, so an agent session can read it
# without a human relaying terminal output by hand.
#
#   bash scripts/report.sh 35 -- bash scripts/probe-store.sh https://www.game.co.za
#   bash scripts/report.sh 27 -- env QUERIES=milk STORES=woolworths bash scripts/smoke-scrapers.sh
#
# WHY THIS EXISTS
#
# A Claude Code cloud session cannot reach this VPS. It has no SSH credentials,
# and its egress proxy refuses even HTTPS to the app's own domain. Every
# observation of the live system therefore arrives by a person copying terminal
# output into a chat window. On 2026-09-17 that cost about thirty round trips in
# a day. This turns two steps into one: run it here, the agent reads the issue.
#
# THIS REPOSITORY IS PUBLIC. Anything posted is world-readable and permanent.
# That is the whole reason for the redaction below, and for the refusal rules.
# Earlier the same day, a probe printed SCRAPERAPI_KEY into its own output
# because a URL through the proxy carried the key as a query parameter. Nobody
# intended it and nothing caught it. Assume the next leak is equally accidental.
#
# WHAT IT DOES ABOUT THAT
#
#   1. Every non-trivial value in .env is masked, whatever it is called. That is
#      the strong guarantee: a secret cannot be posted unless it is absent from
#      .env, in which case it is not this box's secret.
#   2. Common credential shapes are masked even when they are not in .env.
#   3. If anything still looks like a private key or a GitHub token, it refuses
#      to post at all rather than posting something almost clean.
#
# What it cannot do: recognise a secret that appears in a form .env does not
# hold it in - url-encoded, base64'd, or split across lines. Only run it on
# commands already written to print no secrets; the probe scripts and
# smoke-scrapers.sh say so at the top of each file.
#
# Tested offline by scripts/report.test.sh, which stubs curl and asserts a
# known secret does not survive into the posted body.

set -uo pipefail

MAX_BYTES="${REPORT_MAX_BYTES:-50000}"
REPO="${REPORT_REPO:-ethichadebe/Brittle-AI}"
API="${REPORT_API:-https://api.github.com}"

ISSUE="${1:-}"
shift || true
[ "${1:-}" = "--" ] && shift

if [ -z "$ISSUE" ] || [ "$#" -eq 0 ]; then
  echo "usage: bash scripts/report.sh <issue-number> -- <command...>"
  exit 2
fi
case "$ISSUE" in ''|*[!0-9]*) echo "issue must be a number"; exit 2 ;; esac

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

# Literal parse, never sourced: .env holds cookie strings full of semicolons.
TOKEN=""
SECRETS=()
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; *=*) ;; *) continue ;; esac
    k=${line%%=*}; v=${line#*=}
    case "$v" in \"*\") v=${v#\"}; v=${v%\"} ;; esac
    # Short values are words like "production", not secrets, and masking them
    # would redact the output into uselessness.
    [ "${#v}" -ge 8 ] && SECRETS+=("$v")
    # Compose eats a single $, so .env writes secrets containing one as $$.
    # Mask the value the shell would actually see as well as the written form.
    u=$(printf '%s' "$v" | sed 's/\$\$/$/g')
    [ "$u" != "$v" ] && [ "${#u}" -ge 8 ] && SECRETS+=("$u")
    [ "$k" = "GITHUB_REPORT_TOKEN" ] && TOKEN=$u
  done < .env
fi

if [ -z "$TOKEN" ]; then
  echo "GITHUB_REPORT_TOKEN not in .env."
  echo "Create a fine-grained token limited to this one repository with"
  echo "Issues: read and write, and nothing else. It must NOT have contents"
  echo "or workflow access - this box does not need to push."
  exit 1
fi

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
OUT="$WORK/raw"; RED="$WORK/redacted"; PAYLOAD="$WORK/payload.json"; RESP="$WORK/resp.json"

printf '$ %s\n\n' "$*" > "$OUT"
"$@" >> "$OUT" 2>&1
STATUS=$?

python3 - "$OUT" "$RED" "${SECRETS[@]+"${SECRETS[@]}"}" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
# Longest first, so a value containing another is not partly revealed by the
# shorter one being replaced inside it.
secrets = sorted(set(sys.argv[3:]), key=len, reverse=True)
text = open(src, encoding="utf-8", errors="replace").read()
for s in secrets:
    if s:
        text = text.replace(s, "***REDACTED***")
# Credential shapes that may never have been in .env at all.
for pattern in (r"(api[_-]?key=)[^&\s\"']+", r"(access[_-]?token=)[^&\s\"']+",
                r"(token=)[^&\s\"']+", r"(password=)[^&\s\"']+",
                r"(secret=)[^&\s\"']+", r"(Bearer )[A-Za-z0-9._\-]+"):
    text = re.sub(pattern, r"\1***REDACTED***", text, flags=re.I)
open(dst, "w").write(text)
PY

# Refuse rather than post something almost clean.
if grep -qE 'BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}' "$RED"; then
  KEEP="$(mktemp)"; cp "$RED" "$KEEP"
  echo "REFUSING to post: the output still contains something shaped like a"
  echo "private key or a token after redaction. Read it here instead:"
  echo "  $KEEP"
  exit 1
fi

if [ "$(wc -c < "$RED")" -gt "$MAX_BYTES" ]; then
  head -c "$MAX_BYTES" "$RED" > "$RED.cut"
  printf '\n[truncated at %s bytes]\n' "$MAX_BYTES" >> "$RED.cut"
  mv "$RED.cut" "$RED"
fi

echo "--- posting this to issue #$ISSUE (repo is PUBLIC) ---"
head -40 "$RED"
echo "--- end preview ---"

# A fence long enough that nothing in the output can close it early.
python3 - "$RED" "$PAYLOAD" "$STATUS" <<'PY'
import json, re, sys
body = open(sys.argv[1], encoding="utf-8", errors="replace").read()
longest = max((len(m) for m in re.findall(r"`+", body)), default=0)
fence = "`" * max(3, longest + 1)
text = ("Reported from the VPS by `scripts/report.sh`. Exit status %s.\n\n%s\n%s\n%s\n"
        % (sys.argv[3], fence, body, fence))
open(sys.argv[2], "w").write(json.dumps({"body": text}))
PY

# The token goes in through --config on stdin, not on the command line, so it
# never appears in this box's process table.
CODE=$(printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | curl -s --config - \
  -o "$RESP" -w '%{http_code}' -m 60 -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  --data @"$PAYLOAD" \
  "$API/repos/$REPO/issues/$ISSUE/comments")

if [ "$CODE" = "201" ]; then
  python3 -c 'import json,sys;print("posted:", json.load(open(sys.argv[1]))["html_url"])' "$RESP"
else
  echo "post failed: HTTP $CODE"
  head -c 300 "$RESP"; echo
fi
exit "$STATUS"
