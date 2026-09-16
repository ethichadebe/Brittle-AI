# 2026-09-16 — Stop the compose drift

- **Asked for:** make sure today's bug cannot happen again.
- **Worked first time:** yes. One line of the compose file becomes a variable, and the deployment stops needing a local edit.
- **Laptop needed:** no for the repo change; the VPS still has to discard its local modification once, which is the last time it should ever need to.
- **Friction:**
  - The four-month bug was never really about ScraperAPI. The deployed `docker-compose.prod.yml` had been edited by hand to bind `127.0.0.1:8082` instead of `80:80`, because the host already runs another site on port 80. From that moment the file could not be updated by `git pull`, so when `SCRAPERAPI_KEY` was added to the repo's copy in May, the deployment never saw it. The mechanism was ordinary: a file that has to be edited per host cannot also be tracked as if it were identical everywhere.
  - Making the published port `"${FRONTEND_PORT:-80}:80"` removes the reason to edit it. Everyone else still gets `80:80`; a host with something already on 80 sets one line in `.env`. Verified all three cases by interpolating the file and reading the result: unset gives `80:80`, `127.0.0.1:8082` gives `127.0.0.1:8082:80`, `0.0.0.0:9000` gives `0.0.0.0:9000:80`.
  - The README never mentioned any of this. It assumed a clean box with port 80 free, which is not the box this runs on. It now documents the case, and says plainly to edit `.env` rather than the compose file, with the reason attached — a rule without its reason is a rule people work around.
  - `SCRAPERAPI_KEY` was also missing from the README's variable table, which is part of why its absence went unnoticed: there was nothing to check the deployment against.
