# 2026-10-14 — Nightly database backups, and a tested way back (#154)

- **Asked for:** backups, the first thing before a public launch.
- **What changed:**
  - **`scripts/backup-db.sh`,** installed on the server as `accucery-backup` and run by cron each night. It takes one compressed `pg_dump`, checks it before keeping it, and keeps 7 days in `/var/backups/accucery` (root only). Old dumps are removed only after a new one has passed, so a run of failures never eats the last good backup. One log line a night, and a non-zero exit for alerts (#155) to catch.
  - **`scripts/restore-db.sh` (`accucery-restore`):**
    - **Rehearse:** restores into a scratch database and shows its numbers beside live, without touching either.
    - **Replace live:** takes a typed confirmation. It saves the current data first and restores into a new database. Only then does it swap that in, with the app stopped for a few seconds, and it keeps the replaced database.
  - **`docs/backups.md`:** installing, checking, restoring, and how the host's backups and the dumps cover different failures. README points to it.
- **Worked first time:** mostly. `scripts/backup-db.test.sh` runs both scripts against a real Postgres, with a stand-in `docker`. It found three problems:
  - With no backups folder yet, the restore quit silently instead of saying so.
  - CI's `scripts` job runs every `scripts/*.test.sh` on a runner with no database running, so the test would have been red there. It now starts a throwaway Postgres of its own when none is running, and fails rather than skipping when it can't.
  - That throwaway server wasn't stopped afterwards, because the cleanup read a variable that had already gone out of scope.

  All three are fixed. Each guard was broken on purpose (pruning before the checks, no `umask`, no confirmation), and a named test failed each time. The CI path was run as a non-root user against its own cluster: 31 passed, nothing left running.
- **Laptop needed:** no. Installing it is a few commands on the server, and turning on the host's backups is the owner's.
- **Friction:** deploys don't update files on the server, so the scripts are installed into `/usr/local/bin` rather than run from the checkout.
