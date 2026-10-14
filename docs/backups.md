# Database backups

Three ways back (#154). Each one alone can rebuild the app's data:

| | Covers | Kept | Set up by |
| --- | --- | --- | --- |
| **Nightly dump** (`accucery-backup`) | mistakes and damage to the data: a bad migration, a wrong delete, corruption | 7 days on the server | this repo's scripts, installed once on the server |
| **Off-site copy** of each dump, encrypted, on Google Drive | losing the whole server, with at most a night's data lost | 30 days | the same script, once Drive is connected (below) |
| **Host backups** (Hostinger) | losing the whole server, back to the last weekly backup | weekly, as the plan allows | Hostinger, already on |

The nightly dumps sit on the same disk as the database, so on their own they
can't help if the server is lost. The off-site copy and the host's backups can.

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

## The off-site copy on Google Drive (once)

Each night's dump is also copied to Google Drive, through rclone (Ubuntu's own
package). Three things keep it safe:

- **It's encrypted before it leaves the server** (an rclone "crypt" remote).
  Google, or anyone who gets into the Drive account, sees only scrambled names
  and contents.
- **The key is a password only you keep.** Save it somewhere that is not this
  server and not the same Google account: a password manager, or on paper.
  Without it the copies can't be opened by anyone, you included. It is the
  one thing you need to recover from losing the server.
- **The Drive permission is the narrowest one** (`drive.file`): rclone can see
  only the files it made itself, never the rest of the Drive.

Steps (the server ones as root):

1. **On the server,** install rclone:

   ```bash
   apt install -y rclone
   ```

2. **On a computer with a browser,** sign in to Google for rclone. On Windows:
   download rclone from <https://rclone.org/downloads/> (Windows, Intel/AMD
   64-bit), unzip it, type `powershell` in the folder's address bar, and run:

   ```powershell
   .\rclone.exe authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"
   ```

   A browser opens. Choose the Google account and allow it. If Google warns
   that it hasn't verified the app, choose Advanced, then Go to rclone. PowerShell
   then prints a long line between `Paste the following` and `<---End paste`.
   Copy that whole line. It works like a password: paste it only into the next
   step. The long string in the command just asks for the `drive.file` permission.

3. **On the server,** connect Drive. Put the line from step 2 in place of `PASTE`,
   keeping the single quotes, and paste the whole block:

   ```bash
   python3 - 'PASTE' <<'PY'
   import base64, json, subprocess, sys
   blob = "".join(sys.argv[1].split())
   blob += "=" * (-len(blob) % 4)
   settings = json.loads(base64.b64decode(blob))
   print("found:", ", ".join(sorted(settings)))
   subprocess.run(["rclone", "config", "create", "gdrive", "drive", "scope=drive.file",
                   "config_refresh_token=false", "config_change_team_drive=false", "--non-interactive"]
                  + [f"{k}={v}" for k, v in settings.items()], check=True, stdout=subprocess.DEVNULL)
   PY
   rclone lsd gdrive: && echo "Drive connected"
   ```

   It prints `found: client_id, client_secret, token`, then `Drive connected`.

   Why the block: a current rclone on the PC (1.6x and later) doesn't print a
   bare token. It prints all the settings it signed in with, base64-encoded:
   the token, plus the client id and secret that token belongs to. The
   server's rclone (Ubuntu's 1.60) needs all three, or it can't renew the
   sign-in an hour later. The block unpacks them. If the line is instead a bare
   `{"access_token":...}` token (an rclone as old as the server's), use
   `rclone config create gdrive drive scope=drive.file config_refresh_token=false config_change_team_drive=false --non-interactive token='THE LINE'`.

   **If Drive copies start failing** with a sign-in error (the log says
   `off-site copy FAILED`): rclone has said its shared Google client id will
   stop working during 2026. The fix is a client id of your own (free;
   <https://rclone.org/drive/#making-your-own-client-id>). Pack it with the
   permission into the string step 2 passes, on the server:

   ```bash
   python3 -c 'import base64,json,sys; print(base64.b64encode(json.dumps({"client_id":sys.argv[1],"client_secret":sys.argv[2],"scope":"drive.file"}).encode()).decode().rstrip("="))' 'YOUR_ID' 'YOUR_SECRET'
   ```

   Then do steps 2 and 3 again, with what that prints in place of
   `eyJzY29wZSI6ImRyaXZlLmZpbGUifQ` in step 2. The encrypted folder and its
   password (step 4) stay as they are.

4. **On the server,** make the encrypted folder. This makes up a strong
   password, shows it once, and stores it (scrambled) in rclone's root-only
   config. **Save the password it prints before going on.**

   ```bash
   PW=$(openssl rand -base64 24) && echo "SAVE THIS PASSWORD: $PW" && rclone config create accucery-drive crypt remote=gdrive:accucery-backups password="$PW" --obscure >/dev/null && unset PW
   ```

5. **On the server,** turn the copy on, and take a backup to see it work:

   ```bash
   echo 'BACKUP_OFFSITE=accucery-drive:' > /etc/default/accucery-backup
   accucery-backup
   ```

   It prints `backup ok: ...` and then `off-site ok: copied to accucery-drive:, 1 kept there`.
   In Google Drive there is now a folder `accucery-backups` holding a file with
   a scrambled name. That's the encrypted backup.

If the copy fails one night, the night fails (for the alert, #155), but the
local dump is kept as always. Copies older than 30 days are removed from Drive,
and nothing else there is ever touched.

## Checking on it

```bash
tail -n 7 /var/log/accucery-backup.log     # one line a night: ok, or FAILED and why
ls -lh /var/backups/accucery               # the dumps themselves
cat /var/backups/accucery/last-ok          # when the last good one was taken
cat /var/backups/accucery/last-offsite-ok  # when the last good copy reached Drive
rclone lsf accucery-drive:                 # the copies on Drive, by their real names
```

A failed night leaves the earlier dumps alone: old ones are only removed after
a new one has been checked. It also sends one Telegram message, and one more
when backups work again (#155; set up in `docs/alerts.md`).

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

**The server is lost.** The newest data is in last night's copy on Drive.
Either way, first get a server running the app again:

- **Restore Hostinger's latest backup** of the server (from its panel). That
  brings back everything as of that week, rclone's settings included.
- **Or start a new server** and set the app up as in the README.

Then bring last night's data in from Drive. On a new server, first redo steps
1 to 3 above, then make the encrypted folder again with **your saved password**
in place of a new one:

```bash
rclone config create accucery-drive crypt remote=gdrive:accucery-backups password='YOUR SAVED PASSWORD' --obscure >/dev/null
```

Then, on either:

```bash
rclone lsf accucery-drive:     # lists the copies; nothing listed means the password is wrong
mkdir -p /var/backups/accucery
rclone copy accucery-drive:accucery-2026-10-14T001700Z.dump /var/backups/accucery/
accucery-restore /var/backups/accucery/accucery-2026-10-14T001700Z.dump               # rehearse first
accucery-restore --replace-live /var/backups/accucery/accucery-2026-10-14T001700Z.dump

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
- replacing live with and without the confirmation;
- the off-site copy: uploading, catching a failed or cut-short upload,
  pruning only its own files after 30 days, and never uploading a failed dump.

The off-site cases use a stand-in `rclone`, because CI has none. The real one
was run end to end with a local folder standing in for Drive (journal
2026-10-14):
- encrypted names and contents there;
- a fresh setup with only the password found and restored the copy;
- a wrong password listed nothing.

CI's `scripts` job runs it on every pull request.
