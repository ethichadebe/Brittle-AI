#!/usr/bin/env bash
# Nightly database backup (#154). Run by cron on the VPS; see docs/backups.md
# for installing it, and scripts/restore-db.sh for getting a backup back.
#
#   accucery-backup            # what cron runs, once a night
#
# One compressed pg_dump of the live database per run, kept for 7 days in
# /var/backups/accucery. A dump is written under a temporary name, checked
# (pg_restore must be able to read it, and it must hold table data), and only
# then given its real name, so a half-written or empty file is never mistaken
# for a backup. Old dumps are removed only after a new one has passed, so a
# run of failures never eats the last good backup.
#
# These dumps hold every account's email and password hash: the folder is
# readable by root only. They live on the same disk as the database, so they
# cover mistakes and corruption, not losing the server; the host's own
# snapshots cover that (docs/backups.md).
#
# Prints one line per run, and exits non-zero on any failure, for an alert to
# catch (#155). "last-ok" in the folder holds the time of the last good backup.
#
# Settings, for testing (scripts/backup-db.test.sh) more than for the server:
#   ACCUCERY_DIR       where docker-compose.prod.yml and .env are  (/opt/accucery)
#   BACKUP_DIR         where dumps go                            (/var/backups/accucery)
#   BACKUP_KEEP_DAYS   how many days of dumps to keep            (7)

set -euo pipefail

ACCUCERY_DIR="${ACCUCERY_DIR:-/opt/accucery}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/accucery}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"

case "$KEEP_DAYS" in '' | *[!0-9]* | 0) echo "BACKUP_KEEP_DAYS must be a whole number of days, at least 1" >&2; exit 2 ;; esac

# Compose finds .env next to the compose file; the database's own user and
# name are read inside the container, so nothing here needs a password.
in_postgres() {
  docker compose -f "$ACCUCERY_DIR/docker-compose.prod.yml" exec -T postgres "$@"
}

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
final="$BACKUP_DIR/accucery-$stamp.dump"
partial="$BACKUP_DIR/.accucery-$stamp.dump.partial"
trap 'rm -f "$partial"' EXIT

fail() {
  echo "$(date -u +%FT%TZ) backup FAILED: $*" >&2
  exit 1
}

# Custom format: compressed, and restorable table by table if ever needed.
# No owners or privileges, so it restores into any database as any user.
in_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-privileges' \
  > "$partial" || fail "pg_dump exited with an error"

[ -s "$partial" ] || fail "pg_dump wrote nothing"

# Read it back the way a restore would. A dump with no table data at all is
# not a backup of this app, however valid the file is.
contents="$(in_postgres pg_restore --list < "$partial")" || fail "pg_restore can't read the dump"
tables_with_data="$(grep -c ' TABLE DATA ' <<< "$contents" || true)"
[ "$tables_with_data" -gt 0 ] || fail "the dump holds no table data"

mv "$partial" "$final"
date -u +%FT%TZ > "$BACKUP_DIR/last-ok"

# Only now, with a good dump in place: drop those older than KEEP_DAYS.
# (-mtime +N is "more than N whole days old", so N = KEEP_DAYS - 1 keeps a week of nightly dumps.)
find "$BACKUP_DIR" -maxdepth 1 -name 'accucery-*.dump' -mtime +"$((KEEP_DAYS - 1))" -delete

kept="$(find "$BACKUP_DIR" -maxdepth 1 -name 'accucery-*.dump' | wc -l | tr -d ' ')"
size="$(du -h "$final" | cut -f1)"
echo "$(date -u +%FT%TZ) backup ok: $(basename "$final") ($size, $tables_with_data tables), $kept kept"
