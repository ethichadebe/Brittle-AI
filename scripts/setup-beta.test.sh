#!/usr/bin/env bash
# Offline test for scripts/setup-beta.sh. No network, no docker, nginx or
# certbot: each is a stub that records what it was asked.
#
#   bash scripts/setup-beta.test.sh
#
# What matters most: the test site gets its own database password and never
# the live one; Paystack, alerts and the report token are blanked; the beta
# password is stored only hashed and never printed; a re-run keeps the
# existing .env (a new database password would lock the app out of its own
# database); and it stops before changing anything when it should. To check a
# case still bites, delete the `if [ -f "$BETA_DIR/.env" ]` branch's keep in
# setup-beta.sh: "a second run keeps the database password" must fail.

set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-beta.sh"
PASS=0; FAIL=0
HERE_IP="203.0.113.7"; OTHER_IP="198.51.100.9"
LIVE_DBPW="live-db-secret-123"
BETA_PW="correct horse battery"

setup() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/bin" "$BOX/live" "$BOX/nginx/avail" "$BOX/nginx/enabled" "$BOX/le" "$BOX/log"
  cat > "$BOX/live/.env" <<ENV
POSTGRES_USER=accucery
POSTGRES_PASSWORD=$LIVE_DBPW
POSTGRES_DB=accucery
DATABASE_URL=postgresql://accucery:$LIVE_DBPW@postgres:5432/accucery
FRONTEND_URL=https://accucery.com
FRONTEND_PORT=127.0.0.1:8082
SCRAPERAPI_KEY=scr-abc
RESEND_API_KEY=re_key_xyz
PAYSTACK_SECRET_KEY=sk-test
PAYSTACK_PLAN_MONTHLY=PLN_m
TELEGRAM_BOT_TOKEN=tg-1
TELEGRAM_CHAT_ID=999
OWNER_EMAIL=owner@example.com
BACKEND_IMAGE=ghcr.io/x/backend@sha256:aaa
FRONTEND_IMAGE=ghcr.io/x/frontend@sha256:bbb
ENV
  printf 'case "$app" in\n  accucery)\n  ;;\n  accucery-beta)\n  ;;\nesac\n' > "$BOX/dispatcher"
  cat > "$BOX/bin/curl" <<STUB
#!/usr/bin/env bash
args="\$*"
case "\$args" in
  *api.ipify.org*) echo "$HERE_IP" ;;
  */api/health*) printf '%s' "\${HEALTH_CODE:-200}" ;;
  *--resolve*) if [ "\${@: -2:1}" = "-" ] || [[ "\$args" == *" -K "* ]]; then cat >/dev/null; printf 200; else printf 401; fi ;;
esac
STUB
  cat > "$BOX/bin/getent" <<STUB
#!/usr/bin/env bash
echo "\${DNS:-$HERE_IP} STREAM \$2"
STUB
  cat > "$BOX/bin/git" <<STUB
#!/usr/bin/env bash
echo "git \$*" >> "$BOX/log/calls"
dir="\${@: -1}"; mkdir -p "\$dir"; echo "services: {}" > "\$dir/docker-compose.prod.yml"
STUB
  cat > "$BOX/bin/docker" <<STUB
#!/usr/bin/env bash
echo "docker \$* (cwd=\$(pwd))" >> "$BOX/log/calls"
STUB
  cat > "$BOX/bin/certbot" <<STUB
#!/usr/bin/env bash
echo "certbot \$*" >> "$BOX/log/calls"
[ -n "\${CERTBOT_FAIL:-}" ] && exit 1
mkdir -p "$BOX/le/live/beta.accucery.com"; touch "$BOX/le/live/beta.accucery.com/fullchain.pem"
STUB
  cat > "$BOX/bin/nginx" <<STUB
#!/usr/bin/env bash
echo "nginx \$*" >> "$BOX/log/calls"
[ "\$1" = -t ] && [ -n "\${NGINX_REJECT:-}" ] && { echo "nginx: [emerg] bad" >&2; exit 1; }
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "$BOX/bin/sleep"; cp "$BOX/bin/sleep" "$BOX/bin/chgrp"
  chmod +x "$BOX/bin/"*
}

run() {
  PATH="$BOX/bin:$PATH" LIVE_DIR="$BOX/live" BETA_DIR="$BOX/beta" SITE_FILE="$BOX/nginx/avail/accucery-beta" \
    SITE_LINK="$BOX/nginx/enabled/accucery-beta" HTPASSWD="$BOX/htpasswd" LE_DIR="$BOX/le" DISPATCHER="$BOX/dispatcher" \
    HEALTH_WAIT_S=2 BETA_PASSWORD="${PW-$BETA_PW}" bash "$SRC" 2>&1
}

check() { if [ "$2" = 1 ]; then PASS=$((PASS + 1)); echo "ok   $1"; else FAIL=$((FAIL + 1)); echo "FAIL $1"; fi; }
has() { grep -qF -- "$2" <<<"$1" && echo 1 || echo 0; }
lacks() { grep -qF -- "$2" <<<"$1" && echo 0 || echo 1; }
val() { grep -E "^$2=" "$1" | tail -1 | cut -d= -f2-; }

# --- A first run ------------------------------------------------------------
setup
out=$(run); status=$?
env="$BOX/beta/.env"
check "succeeds" "$([ $status = 0 ] && echo 1 || echo 0)"
check "says where the test site is" "$(has "$out" "The test site is at https://beta.accucery.com")"
check "says how to switch deploys on" "$(has "$out" "BETA_DEPLOY = on")"
check "never prints the password" "$(lacks "$out" "$BETA_PW")"
check "never prints an IP address" "$(lacks "$out" "$HERE_IP")"
check "its own address" "$([ "$(val "$env" FRONTEND_URL)" = "https://beta.accucery.com" ] && echo 1 || echo 0)"
check "its own port" "$([ "$(val "$env" FRONTEND_PORT)" = "127.0.0.1:8085" ] && echo 1 || echo 0)"
dbpw=$(val "$env" POSTGRES_PASSWORD)
check "its own database password, not the live one" "$([ -n "$dbpw" ] && [ "$dbpw" != "$LIVE_DBPW" ] && echo 1 || echo 0)"
check "a database address that uses it" "$([ "$(val "$env" DATABASE_URL)" = "postgresql://accucery:$dbpw@postgres:5432/accucery" ] && echo 1 || echo 0)"
check "no trace of the live database password" "$(lacks "$(cat "$env")" "$LIVE_DBPW")"
check "no Paystack" "$([ -z "$(val "$env" PAYSTACK_SECRET_KEY)" ] && [ -z "$(val "$env" PAYSTACK_PLAN_MONTHLY)" ] && echo 1 || echo 0)"
check "no Telegram alerts" "$([ -z "$(val "$env" TELEGRAM_BOT_TOKEN)" ] && [ -z "$(val "$env" TELEGRAM_CHAT_ID)" ] && echo 1 || echo 0)"
check "keeps the ScraperAPI and email keys" "$([ "$(val "$env" SCRAPERAPI_KEY)" = scr-abc ] && [ "$(val "$env" RESEND_API_KEY)" = re_key_xyz ] && echo 1 || echo 0)"
check "starts from the live images" "$([ "$(val "$env" BACKEND_IMAGE)" = "ghcr.io/x/backend@sha256:aaa" ] && echo 1 || echo 0)"
check "each setting once" "$([ "$(grep -c '^FRONTEND_URL=' "$env")" = 1 ] && echo 1 || echo 0)"
check "the .env is readable by root only" "$([ "$(stat -c %a "$env")" = 600 ] && echo 1 || echo 0)"
check "the password is stored hashed" "$(has "$(cat "$BOX/htpasswd")" 'beta:$apr1$')"
check "and never in plain text" "$(lacks "$(cat "$BOX/htpasswd")" "$BETA_PW")"
site=$(cat "$BOX/nginx/avail/accucery-beta")
check "the site asks for the password" "$(has "$site" "auth_basic_user_file $BOX/htpasswd;")"
check "and tells search engines to keep out" "$(has "$site" 'add_header X-Robots-Tag "noindex, nofollow" always;')"
check "and serves the test site's own port" "$(has "$site" "proxy_pass         http://127.0.0.1:8085;")"
check "but lets Chrome see what it needs to offer Install app" "$(has "$site" 'location ~ ^/(manifest\.webmanifest|sw\.js|icon\.svg|icon-[a-z0-9-]+\.png|apple-touch-icon\.png)$ {')"
check "with the password off for those files only" "$([ "$(grep -c 'auth_basic off;' <<<"$site")" = 1 ] && echo 1 || echo 0)"
check "is switched on in nginx" "$([ -L "$BOX/nginx/enabled/accucery-beta" ] && echo 1 || echo 0)"
check "starts the stack in the beta folder only" "$(has "$(cat "$BOX/log/calls")" "--project-directory $BOX/beta up -d (cwd=$BOX/beta)")"
check "checks it asks for the password" "$(has "$out" "asks for the password")"

# --- A second run -------------------------------------------------------------
out=$(run)
check "a second run keeps the database password" "$([ "$(val "$env" POSTGRES_PASSWORD)" = "$dbpw" ] && echo 1 || echo 0)"
check "and says so" "$(has "$out" "keeping the existing")"
rm -rf "$BOX"

# --- Stopping before anything changes ------------------------------------------
setup; printf 'case "$app" in\n  accucery)\n  ;;\nesac\n' > "$BOX/dispatcher"
out=$(run)
check "stops while the dispatcher doesn't know accucery-beta" "$(has "$out" "doesn't know accucery-beta yet")"
check "having made nothing" "$([ ! -e "$BOX/beta" ] && echo 1 || echo 0)"
rm -rf "$BOX"

setup; out=$(DNS="$OTHER_IP" run)
check "stops while beta doesn't point here" "$(has "$out" "doesn't point at this server yet")"
check "without an IP in the message" "$(lacks "$out" "$OTHER_IP")"
check "having made nothing" "$([ ! -e "$BOX/beta" ] && echo 1 || echo 0)"
rm -rf "$BOX"

setup; out=$(PW="short" run)
check "refuses a short password" "$(has "$out" "at least 8 characters")"
check "having made nothing" "$([ ! -e "$BOX/beta" ] && echo 1 || echo 0)"
rm -rf "$BOX"

# --- nginx says no -----------------------------------------------------------------
setup; out=$(NGINX_REJECT=1 run); status=$?
check "nginx rejecting the site removes it again" "$([ ! -e "$BOX/nginx/enabled/accucery-beta" ] && [ ! -e "$BOX/nginx/avail/accucery-beta" ] && echo 1 || echo 0)"
check "and reports failure" "$([ $status != 0 ] && echo 1 || echo 0)"
check "without reloading nginx" "$(lacks "$(cat "$BOX/log/calls")" "nginx -s reload")"
rm -rf "$BOX"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
