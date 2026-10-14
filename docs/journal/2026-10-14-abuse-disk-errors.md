# 2026-10-14 — Per-IP limits, disk and error alerts

- **Asked for:** the first three items on the production-readiness list: abuse limits per visitor address, capped logs with a disk-space alert, and an alert when the server starts answering with errors.
- **What changed:**
  - **Per-IP limits.** The limits from #152 counted per device, and a device is only a cookie: a script that drops it is a new device every request. Searches, location lookups, sign-ups, sign-ins and reset emails now also count per visitor address. These limits are generous, about double a device's, because mobile networks put many people behind one address.
    - In production a request passes two proxies, the host's nginx and the frontend container's. Fastify now trusts exactly those two, so an address a visitor writes into `X-Forwarded-For` themselves is ignored.
    - Private and loopback addresses are exempt. If a proxy ever stops passing the visitor's address on, the app sees only Docker's, and the limits stand aside instead of putting everyone under one limit.
  - **Disk.** The backend checks the server's disk hourly. It sends one message at 85% used, one at 95%, and one once the disk is back under 80%. The gap stops a disk sitting at 85% from messaging every hour.
    - Every container's log is now capped at 3 × 10 MB: in the compose file, and server-wide in `docs/server-upkeep.md`, "The disk", which also says what is safe to remove.
  - **Server errors.** Ten 5xx responses within five minutes send one message naming the routes, by pattern only, so never an id or an email. A quarter hour without one sends the all-clear.
  - **Restarts.** Neither alert repeats itself or loses an open incident across a deploy. `incidents.current()` reads the saved level.
- **Worked first time:** mostly.
  - One typo, a missing comma in an import, which the typecheck caught.
  - The disk check first used the in-memory level, so after a deploy it would have sent a false "fine again". A test now covers that.
  - The search limit was removed on purpose, and both per-IP search tests failed, including the one that spoofs the header behind two proxies.
- **Laptop needed:** no. The owner checks once that the host's nginx passes `X-Forwarded-For` (the README's config does), and caps the logs server-wide (three commands in `docs/server-upkeep.md`).
- **Friction:** none.
