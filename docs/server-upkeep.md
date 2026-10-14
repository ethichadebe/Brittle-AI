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
