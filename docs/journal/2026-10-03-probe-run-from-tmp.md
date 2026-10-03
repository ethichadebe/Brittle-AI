# 2026-10-03 — Run the location probe from /tmp (#66)

- **Asked for:** nothing new. The first run of the location probe failed
  with "cannot open scripts/probe-location-prices.mjs".
- **Worked first time:** no. That failure is the reason for this change.
- **Laptop needed:** no. The owner ran it on the server.
- **Friction:**

  - **A deploy only pulls images.** It never updates the files in
    `/opt/accucery`, so a script merged today isn't there. The run
    instructions assumed it would be.
  - **The fix is to fetch it to `/tmp` and pipe it in from there.**
    Checking the file out inside `/opt/accucery` would have worked too, but
    a modified tracked file there stopped every deploy on 2026-09-17. Only
    the instructions at the top of the probe changed; the code didn't.
  - **Also done:** `GITHUB_REPORT_TOKEN` is now set on the server, so
    `report.sh` posts by itself. The failed run's comment on #66 is the
    proof.
