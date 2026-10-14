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
# OFF-SITE COPY (2026-10-14). When an rclone remote is set (below), each good
# dump is also copied there, checked by size, and kept for 30 days. On the
# server that remote is an encrypted ("crypt") one over Google Drive, so Google
# only ever holds scrambled files; docs/backups.md sets it up. A failed upload
# fails the run, for the alert, but never touches the local dump.
#
# Prints a line per step, and exits non-zero on any failure. In the folder,
# "last-ok" holds the time of the last good backup and "last-offsite-ok" that
# of the last good off-site copy.
#
# ALERTS (#155). When the app's .env holds TELEGRAM_BOT_TOKEN and
# TELEGRAM_CHAT_ID, the same bot as the deploy and the site monitor, a failed
# night sends one message, and the next good night one more saying it's fixed.
# A run of failures sends one, not one a night: "alerting" in the folder marks
# an incident already reported. The token reaches curl on its standard input,
# never on its command line, where any process listing would show it.
#
# Settings. On the server the off-site ones live in /etc/default/accucery-backup
# (read as plain KEY=value lines, never run), so a backup run by hand does
# exactly what cron's does. The rest are for testing (scripts/backup-db.test.sh):
#   ACCUCERY_DIR              where docker-compose.prod.yml and .env are  (/opt/accucery)
#   BACKUP_DIR                where dumps go                            (/var/backups/accucery)
#   BACKUP_KEEP_DAYS          how many days of dumps to keep            (7)
#   BACKUP_OFFSITE            rclone remote for the off-site copy, e.g. accucery-drive:  (none)
#   BACKUP_OFFSITE_KEEP_DAYS  how many days to keep there               (30)
#   BACKUP_CONF               the settings file              (/etc/default/accucery-backup)

set -euo pipefail

# The settings file: only these two keys are read, and only as text. Anything
# already set in the environment wins.
BACKUP_CONF="${BACKUP_CONF:-/etc/default/accucery-backup}"
if [ -r "$BACKUP_CONF" ]; then
  # "|| [ -n ...]" keeps a last line with no newline; quotes around a value are dropped.
  while IFS='=' read -r key value || [ -n "$key" ]; do
    value="${value%\"}"; value="${value#\"}"
    case "$key" in
      BACKUP_OFFSITE) : "${BACKUP_OFFSITE:=$value}" ;;
      BACKUP_OFFSITE_KEEP_DAYS) : "${BACKUP_OFFSITE_KEEP_DAYS:=$value}" ;;
    esac
  done < "$BACKUP_CONF"
fi

ACCUCERY_DIR="${ACCUCERY_DIR:-/opt/accucery}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/accucery}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
OFFSITE="${BACKUP_OFFSITE:-}"
OFFSITE_KEEP_DAYS="${BACKUP_OFFSITE_KEEP_DAYS:-30}"

for days in "$KEEP_DAYS" "$OFFSITE_KEEP_DAYS"; do
  case "$days" in '' | *[!0-9]* | 0) echo "BACKUP_KEEP_DAYS and BACKUP_OFFSITE_KEEP_DAYS must be whole numbers of days, at least 1" >&2; exit 2 ;; esac
done

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

# The bot's two settings from the app's .env: read as text, never run, and only these keys.
: "${TELEGRAM_BOT_TOKEN:=}" "${TELEGRAM_CHAT_ID:=}"
if [ -r "$ACCUCERY_DIR/.env" ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    value="${value%\"}"; value="${value#\"}"
    case "$key" in
      TELEGRAM_BOT_TOKEN) : "${TELEGRAM_BOT_TOKEN:=$value}" ;;
      TELEGRAM_CHAT_ID) : "${TELEGRAM_CHAT_ID:=$value}" ;;
    esac
  done < "$ACCUCERY_DIR/.env"
fi

# Sends one message; true only if Telegram took it. Off without both settings
# (or with the old "..." placeholders).
notify() {
  case "$TELEGRAM_BOT_TOKEN|$TELEGRAM_CHAT_ID" in '|'* | *'|' | '...|'* | *'|...') return 1 ;; esac
  local code
  code="$(printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TELEGRAM_BOT_TOKEN" |
    curl -sS --max-time 20 -K - -o /dev/null -w '%{http_code}' \
      --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" --data-urlencode "text=$1" 2>/dev/null)" || true
  [ "$code" = 200 ]
}

reason="the script stopped unexpectedly"
on_exit() {
  local status=$?
  rm -f "$partial"
  if [ "$status" -ne 0 ]; then
    if [ ! -e "$BACKUP_DIR/alerting" ] && notify "🚨 Accucery's nightly backup failed: $reason. Earlier backups are untouched. Check: tail /var/log/accucery-backup.log"; then
      touch "$BACKUP_DIR/alerting"
    fi
  elif [ -e "$BACKUP_DIR/alerting" ] && notify "✅ Accucery's backups are working again: $(basename "$final")."; then
    rm -f "$BACKUP_DIR/alerting"
  fi
}
trap on_exit EXIT

fail() {
  reason="$*"
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

# ── Off-site copy ──
[ -n "$OFFSITE" ] || exit 0

offsite_fail() {
  reason="the copy to Google Drive failed ($*); the backup on the server is fine"
  echo "$(date -u +%FT%TZ) off-site copy FAILED: $* (the local backup is fine)" >&2
  exit 1
}

# "accucery-drive:" or "accucery-drive:folder", either way.
case "$OFFSITE" in *: | */) target="$OFFSITE$(basename "$final")" ;; *) target="$OFFSITE/$(basename "$final")" ;; esac

rclone copyto "$final" "$target" --retries 3 || offsite_fail "rclone couldn't upload it"

# Read the size back from there. Through an encrypted remote it's the
# original's size, so the two must match exactly.
there="$(rclone lsf --format s "$target")" || offsite_fail "the upload isn't there"
[ "$there" = "$(stat -c %s "$final")" ] || offsite_fail "the copy there is $there bytes, not $(stat -c %s "$final")"
date -u +%FT%TZ > "$BACKUP_DIR/last-offsite-ok"

# Pruning there is housekeeping: if it fails, say so, but the night succeeded.
rclone delete "$OFFSITE" --min-age "${OFFSITE_KEEP_DAYS}d" --include 'accucery-*.dump' \
  || echo "$(date -u +%FT%TZ) off-site: couldn't remove copies older than $OFFSITE_KEEP_DAYS days; will try again tomorrow" >&2

kept_there="$(rclone lsf "$OFFSITE" --include 'accucery-*.dump' | wc -l | tr -d ' ')" || kept_there="?"
echo "$(date -u +%FT%TZ) off-site ok: copied to $OFFSITE, $kept_there kept there"
