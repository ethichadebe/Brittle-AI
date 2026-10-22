#!/usr/bin/env bash
# Sets up the test site, beta.accucery.com, on the server. Once, as root:
#
#   cd /opt/accucery && bash scripts/setup-beta.sh
#
# Before running it: the updated dispatcher (with its `accucery-beta` block,
# ethichadebe/workflows) is installed, and beta.accucery.com points at this
# server. Afterwards, one switch on GitHub turns on deploys from every pull
# request: the repository variable BETA_DEPLOY = on. See docs/beta.md.
#
# What it makes, beside the live app and touching none of it:
#   /opt/accucery-beta          a checkout of the repo, for its compose file
#   /opt/accucery-beta/.env     the live .env, with the test site's own address,
#                               port and database password; no Paystack, no
#                               Telegram alerts, no GitHub report token
#   a database of its own       empty: never a copy of shoppers' data
#   beta.accucery.com in nginx  HTTPS, a password (user "beta"), and a header
#                               telling search engines not to list it
#
# Running it again is safe: an existing .env, and its database password, are
# kept. It prints no IP address and never the password.
# Tested offline by scripts/setup-beta.test.sh.

set -uo pipefail

NAME="${1:-beta.accucery.com}"
LIVE_DIR="${LIVE_DIR:-/opt/accucery}"
BETA_DIR="${BETA_DIR:-/opt/accucery-beta}"
PORT="${BETA_PORT:-127.0.0.1:8085}"
SITE_FILE="${SITE_FILE:-/etc/nginx/sites-available/accucery-beta}"
SITE_LINK="${SITE_LINK:-/etc/nginx/sites-enabled/accucery-beta}"
HTPASSWD="${HTPASSWD:-/etc/nginx/accucery-beta.htpasswd}"  # gitleaks:allow -- a file path, not a secret
LE_DIR="${LE_DIR:-/etc/letsencrypt}"
DISPATCHER="${DISPATCHER:-/usr/local/sbin/md-deploy-root}"
REPO_URL="${REPO_URL:-https://github.com/ethichadebe/Brittle-AI.git}"
HEALTH_WAIT_S="${HEALTH_WAIT_S:-120}"

say() { printf '%s\n' "$*"; }
fail() { say "STOPPED: $*"; exit 1; }

case "$NAME" in *[!a-z0-9.-]*|.*|*.) fail "\"$NAME\" isn't a plain domain name" ;; esac

# --- Checks: before anything changes ------------------------------------------
[ -f "$LIVE_DIR/.env" ] || fail "no live .env at $LIVE_DIR/.env"
grep -q "^  accucery-beta)" "$DISPATCHER" 2>/dev/null \
  || fail "the dispatcher doesn't know accucery-beta yet. Install the updated one first (docs/beta.md, step 1)."
say "ok: the dispatcher knows accucery-beta"

here=$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)
[ -n "$here" ] || fail "couldn't read this server's own address to check DNS"
getent ahostsv4 "$NAME" 2>/dev/null | awk '{print $1}' | grep -qxF "$here" \
  || fail "$NAME doesn't point at this server yet. Add its A record in Hostinger (name: beta), wait, and run again."
say "ok: $NAME points here"

# The password, typed twice and never shown. BETA_PASSWORD is for the tests.
pw="${BETA_PASSWORD:-}"
if [ -z "$pw" ]; then
  read -rsp "Choose a password for $NAME (user: beta): " pw; echo
  read -rsp "Type it again: " pw2; echo
  [ "$pw" = "$pw2" ] || fail "the two passwords don't match. Nothing was changed."
fi
[ "${#pw}" -ge 8 ] || fail "use at least 8 characters for the password. Nothing was changed."

# --- The app: folder, settings, database ------------------------------------------
if [ ! -d "$BETA_DIR" ]; then
  git clone -q --depth 1 "$REPO_URL" "$BETA_DIR" || fail "couldn't clone the repo into $BETA_DIR"
fi
[ -f "$BETA_DIR/docker-compose.prod.yml" ] || fail "no docker-compose.prod.yml in $BETA_DIR"

if [ -f "$BETA_DIR/.env" ]; then
  say "ok: keeping the existing $BETA_DIR/.env (and its database password)"
else
  envval() { grep -E "^$1=" "$LIVE_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"; }
  user=$(envval POSTGRES_USER); db=$(envval POSTGRES_DB)
  [ -n "$user" ] && [ -n "$db" ] || fail "POSTGRES_USER and POSTGRES_DB must be set in the live .env"
  dbpw=$(openssl rand -hex 24)
  umask 077
  awk -v url="https://$NAME" -v port="$PORT" -v dbpw="$dbpw" -v dburl="postgresql://$user:$dbpw@postgres:5432/$db" '
    BEGIN {
      set["FRONTEND_URL"] = url; set["FRONTEND_PORT"] = port
      set["POSTGRES_PASSWORD"] = dbpw; set["DATABASE_URL"] = dburl
      # The test site takes no payments, sends no alerts, files no reports.
      set["PAYSTACK_SECRET_KEY"] = ""; set["PAYSTACK_PLAN_MONTHLY"] = ""; set["PAYSTACK_PLAN_YEARLY"] = ""
      set["TELEGRAM_BOT_TOKEN"] = ""; set["TELEGRAM_CHAT_ID"] = ""; set["GITHUB_REPORT_TOKEN"] = ""
    }
    match($0, /^[A-Z_][A-Z0-9_]*=/) {
      key = substr($0, 1, RLENGTH - 1)
      if (key in set) { if (!(key in done)) print key "=" set[key]; done[key] = 1; next }
    }
    { print }
    END { for (k in set) if (!(k in done)) print k "=" set[k] }
  ' "$LIVE_DIR/.env" > "$BETA_DIR/.env" || fail "couldn't write $BETA_DIR/.env"
  chmod 600 "$BETA_DIR/.env"
  say "ok: wrote $BETA_DIR/.env: the test site's own address, port and database"
fi

(cd "$BETA_DIR" && docker compose -f docker-compose.prod.yml --project-directory "$BETA_DIR" up -d >/dev/null 2>&1) \
  || fail "docker compose couldn't start the test site in $BETA_DIR"
healthy=""
for _ in $(seq 1 "$HEALTH_WAIT_S"); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://$PORT/api/health" || true)" = 200 ] && { healthy=1; break; }
  sleep 1
done
[ -n "$healthy" ] || fail "the test site didn't come up on $PORT. See: docker compose -f $BETA_DIR/docker-compose.prod.yml logs backend"
say "ok: the test site is running, with its own empty database"

# --- The address: password, certificate, nginx --------------------------------------
printf 'beta:%s\n' "$(printf '%s' "$pw" | openssl passwd -apr1 -stdin)" > "$HTPASSWD" || fail "couldn't write $HTPASSWD"
# Readable by nginx's workers, whoever they run as on this box, and nobody else.
worker=$(nginx -T 2>/dev/null | awk '$1 == "user" { sub(/;$/, "", $2); print $2; exit }')
group=$(id -gn "${worker:-www-data}" 2>/dev/null || echo www-data)
chmod 640 "$HTPASSWD"
chgrp "$group" "$HTPASSWD" 2>/dev/null || chmod 644 "$HTPASSWD"
say "ok: password set (user: beta)"

certbot certonly --nginx -d "$NAME" --non-interactive --agree-tos --keep-until-expiring \
  || fail "certbot couldn't get a certificate for $NAME"
CERT="$LE_DIR/live/$NAME"
[ -f "$CERT/fullchain.pem" ] || fail "certbot finished, but there's no certificate in $CERT"
say "ok: certificate for $NAME"

cat > "$SITE_FILE" <<SITE
# The test site (docs/beta.md). Written by scripts/setup-beta.sh.
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $NAME;
    ssl_certificate $CERT/fullchain.pem;
    ssl_certificate_key $CERT/privkey.pem;
    include $LE_DIR/options-ssl-nginx.conf;
    ssl_dhparam $LE_DIR/ssl-dhparams.pem;
    # Not for shoppers, and not for search engines.
    auth_basic "Accucery beta";
    auth_basic_user_file $HTPASSWD;
    add_header X-Robots-Tag "noindex, nofollow" always;
    # What Chrome fetches, without the password, to decide whether to offer
    # "Install app": public files, the same as on the live site.
    location ~ ^/(manifest\.webmanifest|sw\.js|icon\.svg|icon-[a-z0-9-]+\.png|apple-touch-icon\.png)\$ {
        auth_basic off;
        proxy_pass         http://$PORT;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
    location / {
        proxy_pass         http://$PORT;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
server {
    listen 80;
    listen [::]:80;
    server_name $NAME;
    return 301 https://$NAME\$request_uri;
}
SITE
ln -sf "$SITE_FILE" "$SITE_LINK"
if ! nginx -t >/dev/null 2>&1; then
  say "nginx rejected the test site's config:"; nginx -t 2>&1 | tail -3
  rm -f "$SITE_LINK" "$SITE_FILE"
  fail "the nginx site was removed again; the live app is untouched."
fi
nginx -s reload
sleep 2

probe() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$NAME:443:127.0.0.1" "$@" "https://$NAME/" || true; }
locked=$(probe); opened=$(probe -K - <<<"user = \"beta:$pw\"")
[ "$locked" = 401 ] && say "ok: https://$NAME asks for the password" || say "CHECK: without the password it answered $locked, not 401"
[ "$opened" = 200 ] && say "ok: with the password it opens the app" || say "CHECK: with the password it answered $opened, not 200"

say ""
say "Done. The test site is at https://$NAME (user: beta)."
say "Last step, on GitHub: Settings > Secrets and variables > Actions > Variables >"
say "New repository variable: BETA_DEPLOY = on. From then on every pull request deploys there."
