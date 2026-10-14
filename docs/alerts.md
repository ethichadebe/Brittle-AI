# Alerts

Everything that can go wrong without anyone noticing messages one Telegram bot:
the owner's, the one the deploy already used (#155). Each problem sends **one
message when it starts and one when it's fixed**, never one per failure.

| Alert | Sent by | When | Then |
| --- | --- | --- | --- |
| **A deploy failed** | `compose-deploy.yml` (ethichadebe/workflows) | a deploy is discarded | Nothing is broken: the live version keeps serving. Look at the run it links. |
| **The site is down** | `monitor.yml` (ethichadebe/workflows) | a site fails two checks 30s apart, every 15 minutes | See below: it repeats while down. |
| **A store's searches fail** | the app (`backend/src/alerts`) | 5 searches at one store fail in a row | Usually the store changed its site or is blocking us, or ScraperAPI is out of credits (Checkers, Shoprite). The message quotes the error. |
| **ScraperAPI credits low** | the app, hourly | 80% of the month used, again at 95%, and when it renews | Checkers and Shoprite stop finding prices at 100%. Top up, or move to a bigger plan. |
| **A night's backup failed** | `accucery-backup` (`scripts/backup-db.sh`) | the nightly backup or its Drive copy fails | `tail /var/log/accucery-backup.log` says why. Earlier backups are untouched. |

Once an alert has been sent, that's remembered: the app keeps it in the
database, the backup in a file next to the backups. So a restart or a deploy
never sends the same alert twice. If Telegram can't be reached, nothing is
counted as sent, and the next check tries again.

## Setting up the app's and the backup's alerts (once)

The deploy and the site monitor read the bot from GitHub's Actions secrets.
The app and the backup run on the server, so they need the same two values in
`/opt/accucery/.env`:

```
TELEGRAM_BOT_TOKEN=...   # from @BotFather: /mybots → the bot → API Token
TELEGRAM_CHAT_ID=...     # the chat the deploy messages already go to
```

The server's `docker-compose.prod.yml` is not updated by deploys. So it also
needs, under the backend's `environment:`, the two lines this repo's copy
carries:

```yaml
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}
```

Then recreate the backend (`docker compose -f docker-compose.prod.yml up -d
--force-recreate backend`) and send a test:

```bash
docker compose -f docker-compose.prod.yml exec backend node dist/alerts/sendTest.js
```

It prints `Sent. Check Telegram.`, or what Telegram said and which of the two
values is likely wrong. `report.sh` masks every `.env` value, so the token
can't end up in an issue comment.

## Known gap

`monitor.yml` lives in ethichadebe/workflows and, unlike the rest, messages
every 15 minutes for as long as a site is down, with no message when it's back.
Making it once-per-incident is a change to that repository.
