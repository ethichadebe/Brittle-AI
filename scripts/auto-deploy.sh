#!/usr/bin/env bash
# Redeploy when master moves. Driven by a systemd timer; see deploy/README.md.
#
#   bash scripts/auto-deploy.sh            # deploy if master moved
#   bash scripts/auto-deploy.sh --dry-run  # say what it would do, change nothing
#
# Nothing on GitHub can reach this box: the box asks GitHub. No credentials, no
# inbound access, no runner. The cost is up to one polling interval of delay.

set -uo pipefail

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || { echo "cannot enter $REPO_DIR"; exit 1; }

LOG="${ACCUCERY_DEPLOY_LOG:-/var/log/accucery-deploy.log}"
LOCK="${ACCUCERY_DEPLOY_LOCK:-/var/lock/accucery-deploy.lock}"
COMPOSE=(docker compose -f docker-compose.prod.yml)
BRANCH=master

log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ)  $*"
  printf '%s\n' "$line" >> "$LOG" 2>/dev/null || true
  $DRY_RUN && printf '%s\n' "$line"
  return 0
}

# Which port the frontend is published on. Read .env literally rather than
# sourcing it: the file holds a cookie full of semicolons, spaces and dollars,
# and sourcing it once printed a session token to someone's terminal.
# FRONTEND_PORT may be a bare port (8082) or a host-scoped one (127.0.0.1:8082);
# either way the last colon-separated field is the port.
port=80
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; *=*) ;; *) continue ;; esac
    k=${line%%=*}; v=${line#*=}
    case "$v" in \"*\") v=${v#\"}; v=${v%\"} ;; esac
    [ "$k" = "FRONTEND_PORT" ] && [ -n "$v" ] && port=${v##*:}
  done < .env
fi
BASE="http://127.0.0.1:$port"

# A rebuild takes minutes. Never let two overlap.
if ! $DRY_RUN; then
  exec 9>"$LOCK" || exit 1
  flock -n 9 || exit 0   # another run holds it; nothing to say
fi

git fetch --quiet origin "$BRANCH" || { log "FAIL  git fetch"; exit 1; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  $DRY_RUN && echo "up to date at ${LOCAL:0:8} — nothing to do (checks would run against $BASE)"
  exit 0                  # the common case: stay silent, do not fill the log
fi

# Never clobber a change someone made on the box. Better to stop and be noticed.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "SKIP  tracked files modified locally; refusing to overwrite. Resolve by hand."
  exit 1
fi

# Only rebuild images when something that ends up inside one has changed. This
# repo gets a lot of journal-only commits, and a rebuild costs minutes.
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")
N_CHANGED=$(printf '%s\n' "$CHANGED" | grep -c . || true)
if printf '%s\n' "$CHANGED" | grep -qE '^(frontend/|backend/|packages/|docker-compose\.prod\.yml$|nginx\.conf$|package(-lock)?\.json$)|Dockerfile'; then
  NEEDS_BUILD=true
else
  NEEDS_BUILD=false
fi

log "deploy ${LOCAL:0:8} -> ${REMOTE:0:8} ($N_CHANGED files, build=$NEEDS_BUILD)"

if $DRY_RUN; then
  echo "would: git merge --ff-only origin/$BRANCH"
  $NEEDS_BUILD && echo "would: ${COMPOSE[*]} up -d --build" \
               || echo "would: skip rebuild (no image inputs changed)"
  echo "would: check $BASE/api/health, /api/lists and /"
  exit 0
fi

if ! git merge --ff-only "origin/$BRANCH" --quiet; then
  log "FAIL  not a fast-forward; local history diverged. Resolve by hand."
  exit 1
fi

if $NEEDS_BUILD; then
  if ! "${COMPOSE[@]}" up -d --build >>"$LOG" 2>&1; then
    log "FAIL  compose build. Previous containers left running."
    exit 1
  fi
else
  "${COMPOSE[@]}" up -d >>"$LOG" 2>&1 || true
fi

# Wait for the backend: its entrypoint runs prisma migrate deploy before listening.
for _ in $(seq 1 30); do
  curl -sf -m 3 "$BASE/api/health" >/dev/null 2>&1 && break
  sleep 2
done

# Deliberately not the scraper smoke test. Each Checkers search costs a
# ScraperAPI credit, and a deploy-time check that burns metered quota will be
# switched off the first time someone notices the bill. /api/lists is the
# cheapest request that still proves nginx, the backend and Postgres are all up.
FAILED=""
for probe in "/api/health" "/api/lists" "/"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$BASE$probe")
  [ "$code" = "200" ] || FAILED="$FAILED $probe($code)"
done

if [ -n "$FAILED" ]; then
  log "FAIL  deployed ${REMOTE:0:8} but checks failed:$FAILED"
  exit 1
fi

log "OK    deployed ${REMOTE:0:8}"
