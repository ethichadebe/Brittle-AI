# Accucery

Grocery list app with live store pricing for South African retailers (Checkers, Shoprite, Pick n Pay).

## Development

```bash
npm install
npm run dev          # starts frontend on :5173 and backend on :3000
```

Requires a local PostgreSQL instance. Copy and fill in `backend/.env`:

```
DATABASE_URL=postgresql://accucery:accucery@localhost:5432/accucery
FRONTEND_URL=http://localhost:5173
CHECKERS_COOKIES=   # paste from DevTools on checkers.co.za
SHOPRITE_COOKIES=   # same, from shoprite.co.za (optional)
```

Run migrations:

```bash
cd backend && npx prisma migrate dev
```

## Production deployment (Hostinger VPS)

### 1. Install Docker and Docker Compose

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Clone the repo on the VPS

```bash
git clone https://github.com/ethichadebe/Brittle-AI.git accucery
cd accucery
```

### 3. Create the environment file

```bash
cp .env.example .env
nano .env          # fill in POSTGRES_PASSWORD, FRONTEND_URL, the cookies and SCRAPERAPI_KEY
```

| Variable | Description |
|---|---|
| `POSTGRES_USER` | Database username (default: `accucery`) |
| `POSTGRES_PASSWORD` | **Change this** — strong password |
| `POSTGRES_DB` | Database name (default: `accucery`) |
| `DATABASE_URL` | Must match the three `POSTGRES_*` values above |
| `FRONTEND_URL` | Your VPS IP or domain (e.g. `http://123.456.789.0`) |
| `CHECKERS_COOKIES` | Full cookie string from Checkers DevTools — see below |
| `SHOPRITE_COOKIES` | The same, from `shoprite.co.za`. Optional: without it Shoprite prices against its own default store |
| `SCRAPERAPI_KEY` | Routes Checkers and Shoprite through a residential proxy. Required on a VPS: their WAF blocks datacenter IPs |
| `FRONTEND_PORT` | Optional. Where to publish the frontend. Unset means `80` on all interfaces |

### 3b. If this host already uses port 80

Running another site on the same box? Publish the frontend somewhere else and
point your system nginx at it, rather than editing `docker-compose.prod.yml`:

```bash
echo 'FRONTEND_PORT=127.0.0.1:8082' >> .env
```

Then a server block on the host:

```nginx
server {
    listen 80;
    server_name your-domain-or-ip;
    location / {
        proxy_pass         http://127.0.0.1:8082;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

The container's own nginx already routes `/api/` to the backend, so proxying
everything to that one port is enough.

**Edit `.env`, never the compose file.** A locally-modified
`docker-compose.prod.yml` cannot be updated by `git pull`, and that is exactly
how `SCRAPERAPI_KEY` stayed missing from this deployment for four months while
the repo had it.

### 4. Start the stack — from CI, not from the box

Run the **Deploy** workflow (*Actions → Deploy → Run workflow*), or push to
`master`. There is no `docker compose up --build` step any more: the production
compose file names images rather than build contexts, so there is nothing on the
box to build from.

The deploy builds both images in CI, pushes them to `ghcr.io` by digest, and
hands the VPS a manifest. The dispatcher pulls them and writes `BACKEND_IMAGE`
and `FRONTEND_IMAGE` into this `.env` itself — that is why they are not in
`.env.example` and must not be set by hand. It then:

- starts PostgreSQL, which no later deploy ever recreates
- runs `prisma migrate deploy`, stopping first if a pending migration would drop
  or retype something that already exists
- brings the candidate containers up on local-only ports and checks them before
  the live stack moves
- serves the app on port 80

Compose commands that only talk to what is already running — `logs`, `exec`,
`up -d --force-recreate backend` in step 5 — work normally on the box, because
the dispatcher has put those two values in `.env`. On a box that has never
deployed, they have nothing to point at until the first run of the workflow.

### 5. Refreshing store cookies

Checkers and Shoprite both sit behind the same WAF and both set an
`aws-waf-token` cookie that expires. When searches stop returning results:

1. Open `https://www.checkers.co.za` (or `https://www.shoprite.co.za`) in Chrome
2. Browse to a product, so the site sets `storeContexts`
3. DevTools → Network → search for any product → find the `get-products-filter` request
4. Right-click → Copy → Copy as cURL
5. On the VPS, paste it into a file and let the script do the rest:

   ```bash
   cd /opt/accucery
   cat > /tmp/store.curl      # paste, then Ctrl+D
   python3 scripts/set-store-cookie.py checkers    # or: shoprite
   rm -f /tmp/store.curl
   ```

   It writes a correctly quoted `CHECKERS_COOKIES` / `SHOPRITE_COOKIES` line,
   escapes the `$` signs Compose would otherwise eat, checks `storeContexts` is
   present, and prints lengths rather than values.

6. `docker compose -f docker-compose.prod.yml up -d --force-recreate backend`

   Not `restart`. Compose bakes `environment:` into the container when it is
   created, so a restart re-runs the old values and the new cookie never
   arrives. `--force-recreate` makes a new container that reads the new `.env`.

### Updating

Nothing — merge the pull request and it deploys itself. A push to `master` runs
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds
both images in CI, pushes them to `ghcr.io` by digest, and hands the VPS a
manifest to pull. Nothing is built on the server and the database container is
never recreated.

To deploy without a merge — re-running a failed deploy, say — use the
**Deploy** workflow's *Run workflow* button, which is what `workflow_dispatch`
in that file is for.

This replaced a timer on the box that polled `master` once a minute and built
there. That path was retired on 2026-09-20 and its files are gone; `docker
compose up -d --build` on the server no longer works, because the production
compose file names images rather than build contexts.

Migrations run automatically on startup via the backend entrypoint.
