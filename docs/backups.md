# Database backups

Two independent ways back (#154). Either one alone can rebuild the app's data:

| | Covers | Kept | Set up by |
| --- | --- | --- | --- |
| **Host backups** (Hostinger) | losing the whole server: disk failure, a broken OS, a bad update | as the host's plan allows | the owner, in Hostinger's panel |
| **Nightly dump** (`accucery-backup`) | mistakes and damage to the data: a bad migration, a wrong delete, corruption | 7 days, one per night | this repo's scripts, installed once on the server |

The nightly dumps sit on the same disk as the database, so they can't help if
the server itself is lost. That's what the host's backups are for.

## What's in a dump

All of it: every account (email and password hash), list, item, subscription
and saved price. That's personal data, so the folder `/var/backups/accucery`
and every file in it are readable by root only. Never post a dump anywhere,
attach it to an issue, or copy it somewhere you wouldn't keep a password.

## Installing it (once)

Deploys only pull images; they never update files on the server. So the
scripts are copied into `/usr/local/bin` once, and copied again only when they
change (the same commands).

On the server, as root:

```bash
cd /tmp
curl -fsSL -o accucery-backup https://raw.githubusercontent.com/ethichadebe/Brittle-AI/master/scripts/backup-db.sh
curl -fsSL -o accucery-restore https://raw.githubusercontent.com/ethichadebe/Brittle-AI/master/scripts/restore-db.sh
install -m 755 accucery-backup accucery-restore /usr/local/bin/
rm accucery-backup accucery-restore
```

Then have cron run the backup every night at 00:17 server time (02:17 in South
Africa when the server is on UTC):

```bash
printf '%s\n' 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' \
  '17 0 * * * root /usr/local/bin/accucery-backup >> /var/log/accucery-backup.log 2>&1' \
  > /etc/cron.d/accucery-backup
```

Check that it works by taking the first backup now, then rehearsing a restore
of it:

```bash
accucery-backup
accucery-restore
```

The first prints one line ending in `backup ok: ...`. The second prints the
backup's numbers of accounts, lists, items and subscriptions next to the live
ones, and `Restore rehearsal ok`. The live data is never touched by a
rehearsal.

## Checking on it

```bash
tail -n 7 /var/log/accucery-backup.log     # one line a night: ok, or FAILED and why
ls -lh /var/backups/accucery               # the dumps themselves
cat /var/backups/accucery/last-ok          # when the last good one was taken
```

A failed night leaves the earlier dumps alone: old ones are only removed after
a new one has been checked. Once alerts exist (#155), a failure, or a
`last-ok` more than a day old, will raise one.

Rehearsing a restore every month or so (`accucery-restore`) is the way to know
the backups are good before you need them.

## Getting data back

**Something went wrong with the data, the server is fine.** Pick the dump from
before it happened (`ls -lh /var/backups/accucery`; names are in UTC) and:

```bash
accucery-restore --replace-live /var/backups/accucery/accucery-2026-10-14T001700Z.dump
```

It asks you to type the live database's name, then:

1. saves the database as it is now, to `before-restore-<time>.dump`;
2. restores the backup into a new database, and stops there if that fails;
3. stops the app, swaps the restored database in, and starts the app again. The app is down for a few seconds.

If the rehearsal showed the backup with fewer `migrations` than live, the
backup is from before a database change. Run the Deploy workflow (Actions →
Deploy → Run workflow) afterwards, and it applies the missing ones.

The replaced database is kept, renamed `accucery_replaced_<time>`. The script
prints the command that drops it once you're sure all is well. Nothing is lost
by restoring the wrong file: run it again with the right one.

**The server is lost.** Restore the host's latest backup from Hostinger's
panel. That brings back the server as it was, with the database and these
dumps. If the newest host backup is older than the newest dump on it, restore
that dump afterwards, as above.

## Testing the scripts

```bash
bash scripts/backup-db.test.sh
```

It runs both scripts against a real Postgres (a running one, or a throwaway
one it starts itself), with a stand-in `docker`, and covers:
- a good backup, and pruning to 7 days;
- a failed dump keeping the old backups;
- an empty database refused;
- a rehearsal;
- a corrupt backup;
- replacing live with and without the confirmation.

CI's `scripts` job runs it on every pull request.
