# Accucery

Grocery list app with live store pricing for South African retailers (Checkers, Pick n Pay).

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
nano .env          # fill in POSTGRES_PASSWORD, FRONTEND_URL, CHECKERS_COOKIES
```

| Variable | Description |
|---|---|
| `POSTGRES_USER` | Database username (default: `accucery`) |
| `POSTGRES_PASSWORD` | **Change this** — strong password |
| `POSTGRES_DB` | Database name (default: `accucery`) |
| `DATABASE_URL` | Must match the three `POSTGRES_*` values above |
| `FRONTEND_URL` | Your VPS IP or domain (e.g. `http://123.456.789.0`) |
| `CHECKERS_COOKIES` | Full cookie string from Checkers DevTools — see below |

### 4. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This single command:
- Builds the backend (TypeScript → JS, Playwright Chromium installed)
- Builds the frontend (`vite build`, served by nginx)
- Starts PostgreSQL
- Runs `prisma migrate deploy` on first boot
- Serves the app on port 80

### 5. Refreshing Checkers cookies

The Checkers scraper requires an `aws-waf-token` cookie that expires periodically. When searches stop returning results:

1. Open `https://www.checkers.co.za` in Chrome
2. DevTools → Network → search for any product → find the `get-products-filter` request
3. Right-click → Copy → Copy as cURL
4. Extract the `Cookie:` header value
5. Update `CHECKERS_COOKIES` in `.env` on the VPS
6. `docker compose -f docker-compose.prod.yml restart backend`

### Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically on startup via the backend entrypoint.
