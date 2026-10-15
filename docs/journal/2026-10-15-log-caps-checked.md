# 2026-10-15 — Log caps and the proxy header, checked on the server

- **Asked for:** the server steps after #182 (per-IP limits, disk alert, log caps).
- **What was found:**
  - **Proxy header:** the host's nginx already passes `X-Forwarded-For` (`$proxy_add_x_forwarded_for`), so the per-IP limits see each visitor's own address.
  - **Log caps:** `/etc/docker/daemon.json` already held exactly the cap `docs/server-upkeep.md` sets (3 × 10 MB). All eight containers, the other two apps' included, showed it. Nothing was changed.
  - **Disk:** 17% of 96 GB used.
  - **robots.txt:** live, with the right address on the Sitemap line.
- **What changed:** only `docs/server-upkeep.md`. The first step no longer says to stop when a file is already there with the cap in it, and it gives the check that proves the cap applies.
- **Worked first time:** yes. Three read-only commands, each pasted from a phone.
- **Laptop needed:** no.
- **Friction:** none.
