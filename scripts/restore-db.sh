#!/usr/bin/env bash
# Get a backup back (#154). Installed on the VPS as accucery-restore; see
# docs/backups.md. Two uses:
#
#   accucery-restore                         rehearse with the newest backup
#   accucery-restore <dump>                  rehearse with that backup
#   accucery-restore --replace-live <dump>   put that backup in place of the live database
#
# REHEARSE (safe, any time): restores the dump into a scratch database next
# to the live one, prints how many accounts, lists, items and subscriptions it
# holds beside the live numbers, then drops the scratch copy. The live
# database and the app are not touched. This is how to know the backups work
# before the day they're needed.
#
# REPLACE LIVE (only to recover from a disaster): asks you to type the live
# database's name, then
#   1. dumps the live database as it is now, to before-restore-<time>.dump;
#   2. restores the backup into a new database, and stops if that fails;
#   3. stops the backend, swaps the restored database in under the live name,
#      and starts the backend again. The replaced one is kept, renamed
#      accucery_replaced_<time>, until you drop it.
# So nothing is lost by running it on the wrong file: both the old data and a
# dump of it are still there.
#
# Settings, for testing (scripts/backup-db.test.sh): ACCUCERY_DIR, BACKUP_DIR,
# as in backup-db.sh.

set -euo pipefail

ACCUCERY_DIR="${ACCUCERY_DIR:-/opt/accucery}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/accucery}"
SCRATCH_DB="accucery_restore_check"

compose() { docker compose -f "$ACCUCERY_DIR/docker-compose.prod.yml" "$@"; }
in_postgres() { compose exec -T postgres "$@"; }
# psql as the database's own user; "$1" is the database, the rest psql's arguments.
psql_in() {
  local db="$1"
  shift
  in_postgres sh -c 'db="$1"; shift; psql -U "$POSTGRES_USER" -d "$db" -v ON_ERROR_STOP=1 -qAt "$@"' sh "$db" "$@"
}
live_db() { in_postgres sh -c 'printf %s "$POSTGRES_DB"'; }

usage() {
  sed -n '5,7p' "$0" | sed 's/^# *//'
  exit 2
}

replace=false
if [ "${1:-}" = "--replace-live" ]; then
  replace=true
  shift
  [ -n "${1:-}" ] || { echo "--replace-live needs the backup to restore, by its path" >&2; exit 2; }
fi
case "${1:-}" in -*) usage ;; esac

dump="${1:-}"
if [ -z "$dump" ]; then
  # No folder yet is the same as no backups yet.
  dump="$(find "$BACKUP_DIR" -maxdepth 1 -name 'accucery-*.dump' 2>/dev/null | sort | tail -n 1 || true)"
  [ -n "$dump" ] || { echo "No backups in $BACKUP_DIR yet." >&2; exit 1; }
fi
[ -s "$dump" ] || { echo "No backup at $dump" >&2; exit 1; }

# Restores $dump into a new, empty database "$1". Fails, leaving it behind to
# be dropped, if any part of the dump doesn't go in.
restore_into() {
  local db="$1"
  # dropdb's "does not exist, skipping" is noise here; createdb would say if anything were really wrong.
  in_postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1" 2>/dev/null; createdb -U "$POSTGRES_USER" "$1"' sh "$db"
  in_postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges --exit-on-error' sh "$db" < "$dump"
}

COUNTS="SELECT 'accounts', count(*) FROM accounts
  UNION ALL SELECT 'lists', count(*) FROM lists
  UNION ALL SELECT 'list items', count(*) FROM list_items
  UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions
  UNION ALL SELECT 'migrations', count(*) FROM _prisma_migrations"

live="$(live_db)"
[ -n "$live" ] || { echo "Couldn't read the live database's name from the postgres container." >&2; exit 1; }

if ! $replace; then
  trap 'in_postgres sh -c '"'"'dropdb -U "$POSTGRES_USER" --if-exists "$1"'"'"' sh "$SCRATCH_DB" >/dev/null 2>&1 || true' EXIT
  echo "Rehearsing a restore of $(basename "$dump") into a scratch database..."
  restore_into "$SCRATCH_DB" || { echo "RESTORE FAILED: this backup could not be restored." >&2; exit 1; }
  from_backup="$(psql_in "$SCRATCH_DB" -F ' ' -c "$COUNTS")"
  from_live="$(psql_in "$live" -F ' ' -c "$COUNTS")"
  echo
  printf '%-15s %10s %10s\n' "" "backup" "live now"
  # Both lists come back in the same order; pair them line by line.
  paste -d '|' <(printf '%s\n' "$from_backup") <(printf '%s\n' "$from_live") | while IFS='|' read -r b l; do
    printf '%-15s %10s %10s\n' "${b% *}" "${b##* }" "${l##* }"
  done
  echo
  echo "Restore rehearsal ok. The live database was not touched; the scratch copy is dropped."
  exit 0
fi

# ── Replace live ──
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
incoming="accucery_incoming"
replaced="accucery_replaced_$stamp"

echo "This replaces the live database \"$live\" with $(basename "$dump")."
echo "The app is stopped for a moment while it happens. The current data is kept (see above)."
printf 'Type the live database name (%s) to go ahead: ' "$live"
read -r typed || true
[ "$typed" = "$live" ] || { echo "Not confirmed; nothing was changed."; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
safety="$BACKUP_DIR/before-restore-$stamp.dump"
echo "1/3 Saving the live database as it is now, to $safety"
in_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-privileges' > "$safety"
[ -s "$safety" ] || { echo "Couldn't save the live database first; nothing was changed." >&2; exit 1; }

echo "2/3 Restoring $(basename "$dump") into a new database"
if ! restore_into "$incoming"; then
  in_postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$incoming" || true
  echo "RESTORE FAILED: the backup didn't restore cleanly. The live database and the app were not touched." >&2
  exit 1
fi

echo "3/3 Swapping it in (the app is down for this step)"
compose stop backend
# Whatever happens next, the app comes back up.
trap 'compose start backend >/dev/null' EXIT
psql_in postgres \
  -v live="$live" -v incoming="$incoming" -v replaced="$replaced" <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname IN (:'live', :'incoming') AND pid <> pg_backend_pid();
ALTER DATABASE :"live" RENAME TO :"replaced";
ALTER DATABASE :"incoming" RENAME TO :"live";
SQL
compose start backend
trap - EXIT

echo
echo "Done. \"$live\" now holds $(basename "$dump"), and the app is running again."
echo "The data it replaced is kept as the database \"$replaced\", and as $safety."
echo "Once you're sure all is well, drop it with:"
echo "  docker compose -f $ACCUCERY_DIR/docker-compose.prod.yml exec postgres sh -c 'dropdb -U \"\$POSTGRES_USER\" $replaced'"
