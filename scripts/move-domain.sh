#!/usr/bin/env bash
# Moves the app to a new address (#200), on the server, as root:
#
#   cd /opt/accucery && bash scripts/move-domain.sh accucery.com
#
# Run it only once the code with /api/handoff (#200) is deployed, and the new
# name and its www already point at this server (scripts/check-domain.sh).
#
# What it does, in an order that never leaves the app unreachable:
#   1. Checks: DNS points here, the deployed app has the handover, the old
#      address's certificate is where the nginx site says.
#   2. Backs up the nginx site file and .env to /root/accucery-move-<time>/.
#   3. Gets a certificate for the new name and its www (certbot).
#   4. Serves the app on the new name, www forwarding to it, with the old
#      address still serving the app as before.
#   5. Sets FRONTEND_URL to the new address and recreates the backend, so its
#      emails, sitemap and handover point there.
#   6. Turns the old address into a handover: every page forwards to the same
#      page at the new address, bringing a shopper's lists along
#      (backend/src/handoff.ts). Its /api/ keeps working, so a webhook still
#      set to the old address isn't lost.
#   7. Checks all three addresses answer as they should.
# Any failure after step 3 puts the backed-up site file and .env back.
#
# It prints no IP address: its output may be posted to the public repo.
# Tested offline by scripts/move-domain.test.sh.

set -uo pipefail

NEW="${1:-}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
SITE_LINK="${SITE_FILE:-/etc/nginx/sites-enabled/accucery}"
LE_DIR="${LE_DIR:-/etc/letsencrypt}"
BACKUP_ROOT="${BACKUP_ROOT:-/root}"
HEALTH_WAIT_S="${HEALTH_WAIT_S:-90}"

say() { printf '%s\n' "$*"; }
fail() { say "STOPPED: $*"; exit 1; }

[ -n "$NEW" ] || fail "say which address to move to, e.g. bash scripts/move-domain.sh accucery.com"
case "$NEW" in *[!a-z0-9.-]*|.*|*.) fail "\"$NEW\" isn't a plain domain name" ;; esac

# --- 1. Checks -------------------------------------------------------------
[ -f "$ENV_FILE" ] || fail "no .env at $ENV_FILE"
envval() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' '; }
url=$(envval FRONTEND_URL)
OLD="${OLD_HOST:-${url#*://}}"; OLD="${OLD%%/*}"
[ -n "$OLD" ] || fail "FRONTEND_URL isn't set in .env"
[ "$OLD" != "$NEW" ] || fail "FRONTEND_URL is already https://$NEW: nothing to move. (Re-running? Set OLD_HOST=<old address>.)"
port=$(envval FRONTEND_PORT)
case "$port" in
  "") UPSTREAM="127.0.0.1:80" ;;
  *:*) UPSTREAM="$port" ;;
  *) UPSTREAM="127.0.0.1:$port" ;;
esac
say "Moving the app from $OLD to $NEW"

SITE=$(readlink -f "$SITE_LINK" 2>/dev/null || true)
[ -n "$SITE" ] && [ -f "$SITE" ] || fail "no nginx site at $SITE_LINK"
grep -q "server_name $OLD;" "$SITE" || fail "$SITE doesn't serve $OLD"
OLD_CERT="$LE_DIR/live/$OLD"
[ -f "$OLD_CERT/fullchain.pem" ] || fail "no certificate for $OLD in $OLD_CERT"

here=$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)
[ -n "$here" ] || fail "couldn't read this server's own address to check DNS"
for name in "$NEW" "www.$NEW"; do
  getent ahostsv4 "$name" 2>/dev/null | awk '{print $1}' | grep -qxF "$here" \
    || fail "$name doesn't point at this server yet. Set its A record (or www's CNAME), wait, and run again."
done
say "ok: $NEW and www.$NEW point here"

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$UPSTREAM/api/handoff/sw.js" || true)
[ "$code" = 200 ] || fail "the running app has no handover yet (got $code). Merge and deploy the #200 pull request first."
say "ok: the running app can hand shoppers over"

# --- 2. Backup -------------------------------------------------------------
BACKUP="$BACKUP_ROOT/accucery-move-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP" || fail "couldn't make $BACKUP"
cp "$SITE" "$BACKUP/site" && cp "$ENV_FILE" "$BACKUP/env" || fail "couldn't back up to $BACKUP"
chmod 600 "$BACKUP/env"
say "ok: backed up the nginx site and .env to $BACKUP"

restore() {
  say "Putting the previous setup back."
  cp "$BACKUP/site" "$SITE"
  cp "$BACKUP/env" "$ENV_FILE"
  nginx -t >/dev/null 2>&1 && nginx -s reload
  (cd "$APP_DIR" && docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate backend >/dev/null 2>&1)
  say "Restored from $BACKUP. The app is on $OLD as before."
}

# --- 3. Certificate --------------------------------------------------------
certbot certonly --nginx -d "$NEW" -d "www.$NEW" --non-interactive --agree-tos --keep-until-expiring \
  || fail "certbot couldn't get a certificate for $NEW. Nothing was changed."
NEW_CERT="$LE_DIR/live/$NEW"
[ -f "$NEW_CERT/fullchain.pem" ] || fail "certbot finished, but there's no certificate in $NEW_CERT. Nothing was changed."
say "ok: certificate for $NEW and www.$NEW"

# --- 4. and 6. The nginx site ----------------------------------------------
proxy_headers='        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;'
tls() {
  printf '    listen 443 ssl;\n    listen [::]:443 ssl;\n'
  printf '    ssl_certificate %s/fullchain.pem;\n    ssl_certificate_key %s/privkey.pem;\n' "$1" "$1"
  printf '    include %s/options-ssl-nginx.conf;\n    ssl_dhparam %s/ssl-dhparams.pem;\n' "$LE_DIR" "$LE_DIR"
}
app_location() {
  printf '    location / {\n        proxy_pass         http://%s;\n        proxy_http_version 1.1;\n%s\n        proxy_read_timeout 120s;\n    }\n' "$UPSTREAM" "$proxy_headers"
}

write_site() { # $1: "serve" keeps the old address serving the app; "handover" forwards it
  {
    printf '# The app, at %s (#200). Written by scripts/move-domain.sh.\n' "$NEW"
    printf 'server {\n    server_name %s;\n' "$NEW"; tls "$NEW_CERT"; app_location; printf '}\n\n'
    printf '# www forwards to the bare name, keeping the page.\n'
    printf 'server {\n    server_name www.%s;\n' "$NEW"; tls "$NEW_CERT"
    printf '    return 301 https://%s$request_uri;\n}\n\n' "$NEW"
    if [ "$1" = serve ]; then
      printf '# The old address, still serving the app while the move happens.\n'
      printf 'server {\n    server_name %s;\n' "$OLD"; tls "$OLD_CERT"; app_location; printf '}\n\n'
    else
      printf '# The old address: every page hands its visitor on to the same page at\n'
      printf '# %s, lists and all (backend/src/handoff.ts). /api/ still answers here,\n' "$NEW"
      printf '# so a webhook or an open tab still set to this address keeps working.\n'
      printf 'server {\n    server_name %s;\n' "$OLD"; tls "$OLD_CERT"
      printf '    location /api/ {\n        proxy_pass         http://%s;\n        proxy_http_version 1.1;\n%s\n        proxy_read_timeout 120s;\n    }\n' "$UPSTREAM" "$proxy_headers"
      printf '    location = /sw.js {\n        rewrite ^ /api/handoff/sw.js break;\n        proxy_pass         http://%s;\n%s\n    }\n' "$UPSTREAM" "$proxy_headers"
      printf '    location / {\n        rewrite ^ /api/handoff/send break;\n        proxy_pass         http://%s;\n%s\n        proxy_set_header   X-Handoff-To      $request_uri;\n    }\n' "$UPSTREAM" "$proxy_headers"
      printf '}\n\n'
    fi
    # Straight to the new address, never via the old one's https: Search
    # Console's "Change of address" checks the old home page's first hop.
    printf '# Plain http, for all three names: straight on to https://%s.\n' "$NEW"
    printf 'server {\n    listen 80;\n    listen [::]:80;\n    server_name %s www.%s %s;\n    return 301 https://%s$request_uri;\n}\n' "$NEW" "$NEW" "$OLD" "$NEW"
  } > "$SITE"
}

apply_site() { # $1: serve | handover
  write_site "$1"
  if ! nginx -t >/dev/null 2>&1; then
    say "nginx rejected the new site:"; nginx -t 2>&1 | tail -3
    restore; exit 1
  fi
  nginx -s reload || { restore; exit 1; }
  # A reload is signalled, not waited for: give the new workers a moment
  # before anything is checked against them.
  sleep 2
}

apply_site serve
say "ok: the app answers on $NEW, www forwards to it, and $OLD still works"

# --- 5. FRONTEND_URL -------------------------------------------------------
sed -i -E "s#^FRONTEND_URL=.*#FRONTEND_URL=https://$NEW#" "$ENV_FILE"
(cd "$APP_DIR" && docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate backend >/dev/null 2>&1) \
  || { say "couldn't recreate the backend"; restore; exit 1; }
healthy=""
for _ in $(seq 1 "$HEALTH_WAIT_S"); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://$UPSTREAM/api/health" || true)" = 200 ]; then healthy=1; break; fi
  sleep 1
done
[ -n "$healthy" ] || { say "the backend didn't come back healthy"; restore; exit 1; }
say "ok: FRONTEND_URL is https://$NEW and the backend is back up"

# --- 6. The handover -------------------------------------------------------
apply_site handover
say "ok: $OLD now hands its visitors on to $NEW"

# --- 7. Check --------------------------------------------------------------
probe() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 --resolve "$1:443:127.0.0.1" "https://$1$2" || true; }
problems=0
expect() { # $1 label, $2 got, $3 pattern
  case "$2" in $3) say "ok: $1" ;; *) say "CHECK: $1, got: $2"; problems=$((problems + 1)) ;; esac
}
expect "https://$NEW/ opens the app" "$(probe "$NEW" /)" "200*"
expect "https://www.$NEW/welcome forwards to https://$NEW/welcome" "$(probe "www.$NEW" /welcome)" "301 https://$NEW/welcome"
expect "https://$OLD/welcome hands over to $NEW" "$(probe "$OLD" /welcome)" "302 https://$NEW/*"
expect "https://$OLD/api/health still answers" "$(probe "$OLD" /api/health)" "200*"

say ""
if [ "$problems" = 0 ]; then say "Done. The app is at https://$NEW"; else say "Moved, but $problems check(s) above need a look. The backup is in $BACKUP."; fi
say "Still to do by hand (the issue lists them): the Paystack webhook, AdSense, Google Search Console."
[ "$problems" = 0 ]
