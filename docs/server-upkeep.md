# Server upkeep: updates and restarts

The VPS (Ubuntu 24.04, Hostinger) runs Accucery and two other apps in Docker.
Done for the first time on 2026-10-14 (#156); this is what worked.

## What looks after itself

- **Security updates install themselves daily** (`unattended-upgrades`, on by
  default). Check with:

  ```bash
  systemctl is-enabled unattended-upgrades; cat /etc/apt/apt.conf.d/20auto-upgrades
  ```

  It should print `enabled`, then both lines ending in `"1";`.
- **The server never restarts itself.** A kernel update waits until someone
  restarts it, so check every month or so.
- **Every app comes back by itself after a restart:** Docker and nginx are
  enabled at boot, and the containers have restart policies. The 2026-10-14
  restart proved it: all eight containers were back within a minute or two.

## Every month or so

1. **Look** (changes nothing):

   ```bash
   apt update && apt list --upgradable 2>/dev/null | wc -l && cat /var/run/reboot-required 2>/dev/null
   ```

   It gives the number of waiting updates, plus `*** System restart required ***` if one is due.

2. **Install them**, without questions and keeping every config file as it is:

   ```bash
   DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade --with-new-pkgs && echo "UPDATES DONE" && systemctl is-enabled docker nginx
   ```

   If Docker itself updates, every container restarts, and the sites blink off
   for a few seconds.

   **The web terminal may drop part way** (it did on 2026-10-14, likely when a
   service it relies on restarted). Don't run it again straight away. Reconnect
   and look:

   ```bash
   pgrep -a apt-get; pgrep -a dpkg; echo "---"; tail -n 4 /var/log/dpkg.log; echo "---"; docker ps --format '{{.Names}}: {{.Status}}'
   ```

   - Lines before the first `---`: it's still running; wait and look again.
   - Otherwise check it finished cleanly. `dpkg --audit` prints nothing when all is well. If it lists anything, run `dpkg --configure -a`, then step 2 again.

   A few packages may stay listed afterwards as "deferred due to phasing" or
   "kept back" (2026-10-14: `apparmor`, `cloud-init`, `open-vm-tools`). Ubuntu
   rolls those out gradually on purpose. Leave them.

3. **Restart, if step 1 or 2 said so.** About 1–2 minutes of downtime, so pick a quiet time:

   ```bash
   systemctl is-enabled docker nginx && reboot
   ```

   It only restarts if both start at boot. After about 2 minutes, reconnect and check:

   ```bash
   uptime -p; uname -r; cat /var/run/reboot-required 2>/dev/null || echo "no restart needed"; docker ps --format '{{.Names}}: {{.Status}}'
   ```

   `up 2 minutes` or so, `no restart needed`, and every container `Up`. Then
   open the app to be sure.

Nightly backups (`docs/backups.md`) carry on through all of this: cron runs
them at 00:17, whether or not the server was restarted that day.

## The disk

Everything on the server shares one disk: the database, the nightly backups,
Docker's images and every container's log. A full disk stops the database
writing, and the app with it. So:

- **The app watches it.** Once an hour the backend checks the disk and sends
  one Telegram message at 85% used, one more at 95%, and one when it's back
  under 80% (`backend/src/alerts/diskAlerts.ts`; the bot is set up in
  `docs/alerts.md`).
- **Container logs are capped** at 3 files of 10 MB each, for every container
  on the server (set up once, below). Without a cap Docker keeps a container's
  log forever.

### Capping the logs (once)

1. **Look** (changes nothing):

   ```bash
   df -h /; cat /etc/docker/daemon.json 2>/dev/null || echo "no daemon.json yet"
   ```

   If it prints `no daemon.json yet`, go on. If it prints a file, stop: the
   settings below have to be merged into it by hand, not written over it.

2. **Set the cap and restart Docker.** Every site blinks off for a few
   seconds while Docker restarts, as when Docker updates:

   ```bash
   printf '%s\n' '{' '  "log-driver": "json-file",' '  "log-opts": { "max-size": "10m", "max-file": "3" }' '}' > /etc/docker/daemon.json && systemctl restart docker && sleep 20 && docker ps --format '{{.Names}}: {{.Status}}'
   ```

   Every container should be `Up`.

3. **Give Accucery's containers the cap now.** Docker applies it to a
   container only when the container is made again. This makes all three
   again, so the app is down for a few seconds. The other apps pick it up on
   their next deploy.

   ```bash
   cd /opt/accucery && docker compose -f docker-compose.prod.yml up -d --force-recreate && docker inspect --format '{{.Name}}: {{.HostConfig.LogConfig.Config}}' $(docker compose -f docker-compose.prod.yml ps -q)
   ```

   Each line ends `map[max-file:3 max-size:10m]`.

### When the disk alert comes

See what is using it (changes nothing):

```bash
df -h /; docker system df; du -sh /var/backups/accucery /var/log/journal 2>/dev/null
```

The usual cause is old Docker images: every deploy pulls new ones and keeps
the old. This removes the ones no container uses that are over a week old.
Running apps are not touched. A rollback to a removed one simply downloads it
again.

```bash
docker image prune -a -f --filter "until=168h" && df -h /
```

If the system's own log (`/var/log/journal`) is large:
`journalctl --vacuum-size=200M`.
