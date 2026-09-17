# Deploying without touching the box

Merging a pull request should be the last thing anyone does by hand. This
directory turns that merge into a deploy.

## How it works

The VPS asks GitHub once a minute whether `master` has moved. If it has, it
fast-forwards, rebuilds if the change touched anything that ends up inside an
image, and checks the site is still answering.

```
merge the PR  ->  (up to 60s)  ->  git fetch + ff-only merge
                                   docker compose up -d [--build]
                                   check /api/health, /api/lists, /
                                -> one line in /var/log/accucery-deploy.log
```

Nothing on GitHub can reach the VPS. There is no runner, no deploy key, no
inbound port, and no credential stored anywhere off the box. The only cost is
up to a minute of delay.

## What it deliberately does not do

- **It does not run the scraper smoke test.** Every Checkers search spends a
  ScraperAPI credit, and a deploy-time check that burns metered quota gets
  switched off the first time someone looks at the bill. Run
  `bash scripts/smoke-scrapers.sh` by hand after a scraper change.
- **It does not deploy over local edits.** If a tracked file has been changed on
  the box, the run stops and says so. A hand-made hotfix is worth more than an
  automatic deploy; losing one silently is how trust in automation dies.
- **It does not rebuild for every commit.** Journal and docs commits skip the
  build and just restart. A rebuild takes minutes.
- **It does not merge anything.** Only a human merges the pull request. This
  just notices afterwards.

## Install it (once, on the VPS)

```bash
cd /opt/accucery
git pull

# See what it would do, without doing any of it.
bash scripts/auto-deploy.sh --dry-run

sudo cp deploy/accucery-deploy.service deploy/accucery-deploy.timer \
        /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now accucery-deploy.timer
```

Check it is armed:

```bash
systemctl list-timers accucery-deploy.timer
```

## Getting told when it breaks

A log file on the server is not a notification. Without this, a failed deploy is
discovered when the site is already broken.

### Telegram (preferred)

The same bot the site monitor in `ethichadebe/workflows` already alerts through.
A chat is properly authenticated, and it is one place to look rather than two.

```bash
cd /opt/accucery
cat >> .env <<'EOF'
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
EOF
bash scripts/auto-deploy.sh --test-notify
```

The chat id comes from messaging the bot once and reading
`https://api.telegram.org/bot<TOKEN>/getUpdates`.

Note this puts the bot token on the server as well as in GitHub Actions secrets.
The token can only send messages as the bot, but it is one more place to rotate
if it ever leaks.

### Or any endpoint that accepts a POST

[ntfy.sh](https://ntfy.sh) needs no account: pick a topic, install the app,
subscribe to the same topic. Both channels can be set at once.

```bash
cd /opt/accucery

# The topic name is the ONLY thing protecting it. Anyone who guesses it reads
# your alerts and can send you fake ones, so make it long — 24 characters, not
# the handful a shorter generator happens to produce.
echo "ACCUCERY_NOTIFY_URL=https://ntfy.sh/accucery-$(tr -dc 'a-z0-9' < /dev/urandom | head -c 24)" >> .env
grep ACCUCERY_NOTIFY_URL .env     # subscribe the app to this topic

bash scripts/auto-deploy.sh --test-notify
```

Two messages should arrive on whichever channels are configured, and
`--test-notify` names them. If they arrive, alerts work.

| When | Priority |
| --- | --- |
| Deploy failed, site not answering, build broke, deploys stalled | high — it buzzes |
| Deploy succeeded | min — silent, just a record that your merge went live |

Nothing else notifies. A run that finds `master` unmoved says nothing at all.

The notifier can never take the site down with it: ten-second timeout, errors
swallowed, no retry. A deploy that worked is still a deploy that worked even if
the message never arrives.

## Watching it

```bash
tail -f /var/log/accucery-deploy.log     # one line per deploy
journalctl -u accucery-deploy -n 50      # if a run failed to start at all
```

A quiet log is the normal state: the script prints nothing when `master` has not
moved, so the log holds deploys and failures only, not 1440 heartbeats a day.

Lines look like:

```
2026-09-16T11:02:14Z  deploy eef6f987 -> 1c4cdc91 (2 files, build=false)
2026-09-16T11:02:31Z  OK    deployed 1c4cdc91
```

Compose's build output goes into the same file, so it grows on rebuild days.
Cap it:

```bash
sudo tee /etc/logrotate.d/accucery-deploy >/dev/null <<'EOF'
/var/log/accucery-deploy.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
    copytruncate
}
EOF
```

## When it stops

| Log line | What happened | What to do |
| --- | --- | --- |
| `FAIL  git fetch` | The box could not reach GitHub | Check DNS and outbound HTTPS from the box |
| `SKIP  tracked files modified locally` | Someone edited a file in `/opt/accucery` | `git diff` on the box: commit it properly or `git checkout --` it |
| `FAIL  not a fast-forward` | The box has commits `master` does not | `git log origin/master..HEAD` and decide by hand |
| `FAIL  compose build` | The image did not build | Build output is in the same log; the old containers are still running |
| `FAIL  deployed … but checks failed` | It deployed and the site did not answer | `docker compose -f docker-compose.prod.yml logs --tail 50` |

The last one is the one to care about: the new code **is** live and failing. The
script does not roll back on its own — an automatic rollback that picks the
wrong moment is worse than a person looking at it.

## Turning it off

```bash
sudo systemctl disable --now accucery-deploy.timer
```
