#!/usr/bin/env bash
# Offline test for scripts/backup-db.sh and scripts/restore-db.sh, against a
# real Postgres: no server, no Docker.
#
#   bash scripts/backup-db.test.sh
#
# Needs Postgres. It uses one already running (a cloud session's, set up as in
# docs/agents/automation.md, which PGHOST, PGPORT, PGUSER and PGPASSWORD
# default to), or else starts a throwaway one of its own in a temp folder and
# removes it after. That second way is how it runs in CI's `scripts` job: the
# runner has Postgres installed but not running. With neither, it fails rather
# than skipping, so a missing database can't pass for a passing test.
#
# A stand-in `docker` on PATH turns `docker compose ... exec -T postgres <cmd>`
# into <cmd> run here, with POSTGRES_USER and POSTGRES_DB set the way the real
# container sets them, and records `stop`/`start` of the backend. So both
# scripts run exactly as written, and every dump is a real pg_dump that a real
# pg_restore reads back.
#
# To check a case still bites, break what it covers and re-run. Moving the
# `find ... -delete` above the checks in backup-db.sh must fail "a failed run
# keeps the old backups"; skipping the confirmation in restore-db.sh must fail
# "replace-live without the right name changes nothing".

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Postgres's "does not exist, skipping" notices would bury the results.
export PGOPTIONS="-c client_min_messages=warning"
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-accucery}" PGPASSWORD="${PGPASSWORD:-accucery}"
LIVE="backup_test_live"
EMPTY="backup_test_empty"
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; [ -n "${2:-}" ] && printf '     %s\n' "$2"; }
check() { if eval "$2"; then ok "$1"; else bad "$1" "${3:-}"; fi; }

pg() { psql -d "${DB:-postgres}" -v ON_ERROR_STOP=1 -qAt "$@"; }

# A cluster of our own: trust auth over a socket in a temp folder, no TCP, so
# it can't clash with anything. initdb won't run as root, hence the check.
# OWN_BIN is global, not local: the EXIT trap reads it after this returns.
start_own_cluster() {
  OWN_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n 1)"
  [ -n "$OWN_BIN" ] && [ -x "$OWN_BIN/initdb" ] && [ "$(id -u)" -ne 0 ] || return 1
  OWN_CLUSTER="$(mktemp -d)"
  "$OWN_BIN/initdb" -D "$OWN_CLUSTER/data" -U accucery --auth=trust > "$OWN_CLUSTER/initdb.log" 2>&1 || return 1
  "$OWN_BIN/pg_ctl" -D "$OWN_CLUSTER/data" -l "$OWN_CLUSTER/server.log" -w \
    -o "-k $OWN_CLUSTER -p 54329 -c listen_addresses=" start > /dev/null || return 1
  trap '"$OWN_BIN/pg_ctl" -D "$OWN_CLUSTER/data" -m fast stop > /dev/null; rm -rf "$OWN_CLUSTER"' EXIT
  export PGHOST="$OWN_CLUSTER" PGPORT=54329 PGUSER=accucery
  # Its own pg_dump and friends, the same version as the server.
  export PATH="$OWN_BIN:$PATH"
}

if [ -n "${BACKUP_TEST_OWN_CLUSTER:-}" ] || ! pg -c 'select 1' >/dev/null 2>&1; then
  if ! start_own_cluster || ! pg -c 'select 1' >/dev/null 2>&1; then
    echo "FAIL no Postgres: none at $PGUSER@$PGHOST:$PGPORT, and couldn't start one here."
    echo "     See docs/agents/automation.md to start one."
    exit 1
  fi
  echo "(using a throwaway Postgres in $PGHOST)"
fi

# A small database shaped like the app's: the tables the restore counts, and
# Prisma's migrations table.
seed() {
  dropdb --if-exists "$1"
  createdb "$1"
  DB="$1" pg <<'SQL'
CREATE TABLE accounts (id text PRIMARY KEY, email text);
CREATE TABLE lists (id text PRIMARY KEY, name text);
CREATE TABLE list_items (id text PRIMARY KEY, list_id text REFERENCES lists(id));
CREATE TABLE subscriptions (account_id text PRIMARY KEY);
CREATE TABLE _prisma_migrations (id text PRIMARY KEY);
INSERT INTO accounts VALUES ('a1', 'one@example.com'), ('a2', 'two@example.com');
INSERT INTO lists VALUES ('l1', 'Weekly'), ('l2', 'Braai'), ('l3', 'Monthly');
INSERT INTO list_items SELECT 'i' || n, 'l1' FROM generate_series(1, 5) n;
INSERT INTO subscriptions VALUES ('a1');
INSERT INTO _prisma_migrations SELECT 'm' || n FROM generate_series(1, 11) n;
SQL
}

setup() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/bin" "$BOX/app" "$BOX/backups"
  : > "$BOX/app/docker-compose.prod.yml"
  cat > "$BOX/bin/docker" <<'STUB'
#!/usr/bin/env bash
[ "$1" = compose ] || exit 90
shift
[ "$1" = -f ] && shift 2
case "$1" in
  exec)
    shift; [ "$1" = -T ] && shift
    [ "$1" = postgres ] || exit 91
    shift
    if [ -n "${BREAK_DUMP:-}" ] && [[ "$*" == *pg_dump* ]]; then echo "pg_dump: connection refused" >&2; exit 1; fi
    POSTGRES_USER="$PGUSER" POSTGRES_DB="$STUB_LIVE_DB" exec "$@" ;;
  stop | start) echo "$1 $2" >> "$STUB_LOG"; exit 0 ;;
  *) exit 92 ;;
esac
STUB
  chmod +x "$BOX/bin/docker"
  export PATH="$BOX/bin:$PATH" ACCUCERY_DIR="$BOX/app" BACKUP_DIR="$BOX/backups/accucery"
  export STUB_LIVE_DB="$LIVE" STUB_LOG="$BOX/services"
  : > "$STUB_LOG"
  seed "$LIVE"
}

teardown() {
  dropdb --if-exists "$LIVE"
  dropdb --if-exists "$EMPTY"
  dropdb --if-exists accucery_restore_check
  dropdb --if-exists accucery_incoming
  for db in $(pg -c "select datname from pg_database where datname like 'accucery_replaced_%'"); do dropdb "$db"; done
  rm -rf "$BOX"
}

backup() { bash "$HERE/backup-db.sh" > "$BOX/out" 2>&1; }
dumps() { find "$BACKUP_DIR" -maxdepth 1 -name 'accucery-*.dump' | sort; }
count() { DB="${2:-$LIVE}" pg -c "select count(*) from $1"; }

# ── Backup ──

setup
backup; code=$?
check "a backup run succeeds" '[ $code -eq 0 ]' "$(cat "$BOX/out")"
check "it says so in one line" 'grep -q "backup ok: accucery-.*5 tables), 1 kept" "$BOX/out"' "$(cat "$BOX/out")"
newest="$(dumps | tail -n 1)"
check "the dump is a real, readable pg_dump" 'pg_restore --list "$newest" | grep -q "TABLE DATA public accounts"'
check "the folder is root's alone" '[ "$(stat -c %a "$BACKUP_DIR")" = 700 ]' "$(stat -c %a "$BACKUP_DIR")"
check "the dump is readable by its owner only" '[ "$(stat -c %a "$newest")" = 600 ]' "$(stat -c %a "$newest")"
check "last-ok records the time" '[ -s "$BACKUP_DIR/last-ok" ]'
check "no half-written file is left" '[ -z "$(find "$BACKUP_DIR" -name "*.partial")" ]'
teardown

setup
mkdir -p "$BACKUP_DIR"
touch -d '8 days ago' "$BACKUP_DIR/accucery-2000-01-01T000000Z.dump"
touch -d '6 days ago' "$BACKUP_DIR/accucery-2000-01-03T000000Z.dump"
touch -d '30 days ago' "$BACKUP_DIR/before-restore-20000101T000000Z.dump"
backup
check "dumps older than 7 days are removed" '[ ! -e "$BACKUP_DIR/accucery-2000-01-01T000000Z.dump" ]'
check "a week's worth are kept" '[ -e "$BACKUP_DIR/accucery-2000-01-03T000000Z.dump" ] && [ "$(dumps | wc -l)" -eq 2 ]' "$(dumps)"
check "a before-restore dump is never pruned" '[ -e "$BACKUP_DIR/before-restore-20000101T000000Z.dump" ]'
teardown

setup
mkdir -p "$BACKUP_DIR"
touch -d '30 days ago' "$BACKUP_DIR/accucery-2000-01-01T000000Z.dump"
echo "earlier" > "$BACKUP_DIR/last-ok"
BREAK_DUMP=1 backup; code=$?
check "a failed dump fails the run" '[ $code -ne 0 ]'
check "and says why" 'grep -q "backup FAILED: pg_dump exited with an error" "$BOX/out"' "$(cat "$BOX/out")"
check "a failed run keeps the old backups" '[ -e "$BACKUP_DIR/accucery-2000-01-01T000000Z.dump" ]'
check "a failed run leaves no new or partial file" '[ "$(find "$BACKUP_DIR" -name "*.dump*" | wc -l)" -eq 1 ]' "$(ls -A "$BACKUP_DIR")"
check "a failed run doesn't move last-ok" '[ "$(cat "$BACKUP_DIR/last-ok")" = earlier ]'
teardown

setup
dropdb --if-exists "$EMPTY"; createdb "$EMPTY"
STUB_LIVE_DB="$EMPTY" backup; code=$?
check "a database with no data isn't taken for a backup" '[ $code -ne 0 ] && grep -q "holds no table data" "$BOX/out"' "$(cat "$BOX/out")"
teardown

setup
BACKUP_KEEP_DAYS=0 backup; code=$?
check "a nonsense keep-days is refused" '[ $code -eq 2 ]'
teardown

# ── Restore: rehearse ──

setup
backup
bash "$HERE/restore-db.sh" > "$BOX/out" 2>&1; code=$?
check "rehearsing the newest backup succeeds" '[ $code -eq 0 ]' "$(cat "$BOX/out")"
check "it shows the backup's numbers beside live" 'grep -Eq "^accounts +2 +2$" "$BOX/out" && grep -Eq "^list items +5 +5$" "$BOX/out" && grep -Eq "^migrations +11 +11$" "$BOX/out"' "$(cat "$BOX/out")"
check "the scratch copy is dropped afterwards" '[ -z "$(pg -c "select 1 from pg_database where datname = '"'"'accucery_restore_check'"'"'")" ]'
check "the app is never stopped for a rehearsal" '[ ! -s "$STUB_LOG" ]'
teardown

setup
mkdir -p "$BACKUP_DIR"
head -c 4096 /dev/urandom > "$BACKUP_DIR/accucery-2099-01-01T000000Z.dump"
bash "$HERE/restore-db.sh" > "$BOX/out" 2>&1; code=$?
check "a corrupt backup fails the rehearsal" '[ $code -ne 0 ] && grep -q "RESTORE FAILED" "$BOX/out"' "$(cat "$BOX/out")"
teardown

setup
bash "$HERE/restore-db.sh" > "$BOX/out" 2>&1; code=$?
check "with no backups yet, it says so" '[ $code -ne 0 ] && grep -q "No backups in" "$BOX/out"' "$(cat "$BOX/out")"
teardown

# ── Restore: replace live ──

setup
backup
good="$(dumps | tail -n 1)"
DB="$LIVE" pg -c "delete from list_items; delete from lists; insert into accounts values ('a3', 'new@example.com')"
echo "wrong_name" | bash "$HERE/restore-db.sh" --replace-live "$good" > "$BOX/out" 2>&1; code=$?
check "replace-live without the right name changes nothing" '[ $code -ne 0 ] && [ "$(count lists)" -eq 0 ] && [ ! -s "$STUB_LOG" ]' "$(cat "$BOX/out")"

echo "$LIVE" | bash "$HERE/restore-db.sh" --replace-live "$good" > "$BOX/out" 2>&1; code=$?
check "replace-live with the name succeeds" '[ $code -eq 0 ]' "$(cat "$BOX/out")"
check "the live database holds the backup again" '[ "$(count lists)" -eq 3 ] && [ "$(count list_items)" -eq 5 ] && [ "$(count accounts)" -eq 2 ]'
replaced="$(pg -c "select datname from pg_database where datname like 'accucery_replaced_%'")"
check "the replaced data is kept as its own database" '[ -n "$replaced" ] && [ "$(count accounts "$replaced")" -eq 3 ]' "$replaced"
check "and as a before-restore dump" '[ -s "$(find "$BACKUP_DIR" -name "before-restore-*.dump" | head -n 1)" ]'
check "the backend was stopped, then started again" '[ "$(cat "$STUB_LOG")" = "$(printf "stop backend\nstart backend")" ]' "$(cat "$STUB_LOG")"
teardown

setup
mkdir -p "$BACKUP_DIR"
head -c 4096 /dev/urandom > "$BOX/corrupt.dump"
echo "$LIVE" | bash "$HERE/restore-db.sh" --replace-live "$BOX/corrupt.dump" > "$BOX/out" 2>&1; code=$?
check "a backup that won't restore leaves live and the app alone" '[ $code -ne 0 ] && [ "$(count lists)" -eq 3 ] && [ ! -s "$STUB_LOG" ]' "$(cat "$BOX/out")"
check "and cleans up its half-restored copy" '[ -z "$(pg -c "select 1 from pg_database where datname = '"'"'accucery_incoming'"'"'")" ]'
teardown

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
