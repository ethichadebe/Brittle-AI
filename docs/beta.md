# The test site: beta.accucery.com

Every pull request is deployed to **https://beta.accucery.com** before it is
merged. Try the change there on your phone, then merge it to send it live.

- **Password-protected:** user `beta`, with the password chosen when it was
  set up. Search engines are told not to list it.
- **Its own empty database:** never a copy of shoppers' lists or accounts.
  Sign up there with any email you can open; confirmation emails link back to
  the test site.
- **Marked BETA** at the top of every screen. No Google Analytics and no ads,
  so tests don't skew the real numbers. No Premium payments, no Telegram alerts.
- **The same ScraperAPI key** as the live site, so Checkers and Shoprite work.
  Test searches use a few of the same monthly credits.
- **One test site, many pull requests:** it shows whichever was pushed last. A
  deploy is announced on Telegram as `accucery-beta`.

## How it works

`.github/workflows/deploy-beta.yml` runs on each pull request and uses the
same shared deploy as the live site (ethichadebe/workflows), to the server's
`accucery-beta` copy in `/opt/accucery-beta`. That copy has its own compose
project, network and database, so a pull request's migrations run there first.
The live app at `/opt/accucery` is never touched. It is off until the
repository variable `BETA_DEPLOY` is `on`.

## Setting it up (once)

1. **The dispatcher learns accucery-beta.** After the ethichadebe/workflows
   pull request that adds it is merged, on the server:

   ```bash
   cp /usr/local/sbin/md-deploy-root /root/md-deploy-root.before-beta && curl -fsSL -o /tmp/md-deploy-root https://raw.githubusercontent.com/ethichadebe/workflows/main/server/md-deploy-root && install -o root -g root -m 0755 /tmp/md-deploy-root /usr/local/sbin/md-deploy-root && grep -c "accucery-beta)" /usr/local/sbin/md-deploy-root
   ```

   It prints `1`. The old copy stays in `/root/md-deploy-root.before-beta`.
2. **DNS:** in Hostinger, add an **A** record named **beta** with the server's
   IP, the same as **@**.
3. **The test site itself**, on the server once this repo's pull request is
   merged:

   ```bash
   curl -fsSL -o /tmp/setup-beta.sh https://raw.githubusercontent.com/ethichadebe/Brittle-AI/master/scripts/setup-beta.sh && bash /tmp/setup-beta.sh
   ```

   It asks for the password twice and shows nothing as you type. It checks the
   first two steps were done before changing anything.
4. **Switch deploys on:** GitHub, Settings > Secrets and variables > Actions >
   Variables > New repository variable: `BETA_DEPLOY` = `on`.

To pause deploys, set `BETA_DEPLOY` to anything else. To change the password,
run step 3 again: it keeps the test site's database and its settings.
