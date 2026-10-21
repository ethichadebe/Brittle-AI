#!/usr/bin/env bash
# Offline test for scripts/move-domain.sh. No network, no real nginx, certbot
# or docker: each is a stub that records what it was asked to do.
#
#   bash scripts/move-domain.test.sh
#
# The script edits a live server's nginx and .env, so the cases that matter
# most are the ones where something goes wrong: it must stop before changing
# anything, or put everything back. To check a case still bites, delete the
# `restore; exit 1` after the health wait in move-domain.sh: "an unhealthy
# backend puts everything back" must fail.

set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/move-domain.sh"
PASS=0; FAIL=0
HERE_IP="203.0.113.7"
OTHER_IP="198.51.100.9"
OLD="accucery.old.example"

setup() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/bin" "$BOX/app" "$BOX/sites" "$BOX/le/live/$OLD" "$BOX/backups" "$BOX/log"
  touch "$BOX/le/live/$OLD/fullchain.pem"
  printf 'POSTGRES_PASSWORD=secret-value\nFRONTEND_URL=https://%s\nFRONTEND_PORT=127.0.0.1:8082\nBACKEND_IMAGE=ghcr.io/x@sha256:abc\n' "$OLD" > "$BOX/app/.env"
  printf 'server {\n    server_name %s;\n    location / { proxy_pass http://127.0.0.1:8082; }\n}\n' "$OLD" > "$BOX/sites/accucery.real"
  ln -s "$BOX/sites/accucery.real" "$BOX/sites/accucery"
  cp "$BOX/sites/accucery.real" "$BOX/original-site"
  cp "$BOX/app/.env" "$BOX/original-env"

  cat > "$BOX/bin/curl" <<STUB
#!/usr/bin/env bash
args="\$*"
url="\${@: -1}"
case "\$args" in
  *api.ipify.org*) echo "$HERE_IP"; exit 0 ;;
  *--resolve*)
    case "\$url" in
      https://accucery.com/) printf '200 ' ;;
      https://www.accucery.com/welcome) printf '301 https://accucery.com/welcome' ;;
      https://$OLD/welcome) printf '302 https://accucery.com/api/handoff/receive?code=x&to=%%2Fwelcome' ;;
      https://$OLD/api/health) printf '200 ' ;;
    esac ;;
  */api/handoff/sw.js*) printf '%s' "\${SW_CODE:-200}" ;;
  */api/health*) printf '%s' "\${HEALTH_CODE:-200}" ;;
esac
STUB
  cat > "$BOX/bin/getent" <<STUB
#!/usr/bin/env bash
case "\$2" in
  accucery.com) echo "\${DNS_APEX:-$HERE_IP} STREAM \$2" ;;
  www.accucery.com) echo "\${DNS_WWW:-$HERE_IP} STREAM \$2" ;;
esac
STUB
  cat > "$BOX/bin/certbot" <<STUB
#!/usr/bin/env bash
echo "certbot \$*" >> "$BOX/log/calls"
[ -n "\${CERTBOT_FAIL:-}" ] && exit 1
mkdir -p "$BOX/le/live/accucery.com" && touch "$BOX/le/live/accucery.com/fullchain.pem"
STUB
  cat > "$BOX/bin/nginx" <<STUB
#!/usr/bin/env bash
echo "nginx \$*" >> "$BOX/log/calls"
if [ "\$1" = -t ] && [ -n "\${NGINX_REJECT:-}" ] && grep -q "\$NGINX_REJECT" "$BOX/sites/accucery.real"; then
  echo "nginx: [emerg] something is wrong" >&2; exit 1
fi
exit 0
STUB
  cat > "$BOX/bin/docker" <<STUB
#!/usr/bin/env bash
echo "docker \$* (FRONTEND_URL=\$(grep ^FRONTEND_URL= .env))" >> "$BOX/log/calls"
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "$BOX/bin/sleep"
  chmod +x "$BOX/bin/"*
}

run() {
  PATH="$BOX/bin:$PATH" APP_DIR="$BOX/app" SITE_FILE="$BOX/sites/accucery" LE_DIR="$BOX/le" \
    BACKUP_ROOT="$BOX/backups" HEALTH_WAIT_S=3 bash "$SRC" accucery.com 2>&1
}

check() {
  if [ "$2" = 1 ]; then PASS=$((PASS + 1)); echo "ok   $1"; else FAIL=$((FAIL + 1)); echo "FAIL $1"; fi
}
has() { grep -qF -- "$2" <<<"$1" && echo 1 || echo 0; }
lacks() { grep -qF -- "$2" <<<"$1" && echo 0 || echo 1; }
same() { cmp -s "$1" "$2" && echo 1 || echo 0; }
calls() { cat "$BOX/log/calls" 2>/dev/null; }

# --- The move -------------------------------------------------------------
setup
out=$(run); status=$?
site=$(cat "$BOX/sites/accucery.real")
check "the move succeeds" "$([ $status = 0 ] && echo 1 || echo 0)"
check "says where the app is now" "$(has "$out" "Done. The app is at https://accucery.com")"
check "prints no IP address" "$(lacks "$out" "$HERE_IP")"
check "writes through the symlink, not over it" "$([ -L "$BOX/sites/accucery" ] && echo 1 || echo 0)"
check "the new name serves the app" "$(has "$site" "server_name accucery.com;")"
check "with its own certificate" "$(has "$site" "ssl_certificate $BOX/le/live/accucery.com/fullchain.pem;")"
check "www forwards to the bare name" "$(has "$site" 'return 301 https://accucery.com$request_uri;')"
check "the old address hands its pages over" "$(has "$site" "rewrite ^ /api/handoff/send break;")"
check "naming the page asked for" "$(has "$site" 'proxy_set_header   X-Handoff-To      $request_uri;')"
check "and retires its service worker" "$(has "$site" "rewrite ^ /api/handoff/sw.js break;")"
check "while its API keeps answering" "$(has "$site" "location /api/ {")"
check "the old address keeps its certificate" "$(has "$site" "ssl_certificate $BOX/le/live/$OLD/fullchain.pem;")"
check "plain http goes to https for all three" "$(has "$site" "server_name accucery.com www.accucery.com $OLD;")"
check "straight to the new address, not via the old one's https" "$(has "$site" "# Plain http, for all three names: straight on to https://accucery.com.")"
check "with one forward for all three" "$([ "$(grep -c 'return 301 https://accucery.com$request_uri;' <<<"$site")" = 2 ] && echo 1 || echo 0)"
check "FRONTEND_URL is the new address" "$(grep -qx 'FRONTEND_URL=https://accucery.com' "$BOX/app/.env" && echo 1 || echo 0)"
check "the rest of .env is untouched" "$(grep -qx 'BACKEND_IMAGE=ghcr.io/x@sha256:abc' "$BOX/app/.env" && grep -qx 'POSTGRES_PASSWORD=secret-value' "$BOX/app/.env" && echo 1 || echo 0)"
check "the backend is recreated with the new address" "$(has "$(calls)" "up -d --no-deps --force-recreate backend (FRONTEND_URL=FRONTEND_URL=https://accucery.com)")"
check "the old address serves the app until the backend knows the new one" "$(has "$(calls)" "nginx -s reload")"
bk=$(ls -d "$BOX/backups"/accucery-move-* 2>/dev/null | head -1)
check "backs up the original site" "$([ -n "$bk" ] && same "$bk/site" "$BOX/original-site" || echo 0)"
check "backs up the original .env" "$([ -n "$bk" ] && same "$bk/env" "$BOX/original-env" || echo 0)"
rm -rf "$BOX"

# --- Stopping before anything changes --------------------------------------
setup
out=$(DNS_WWW="$OTHER_IP" run); status=$?
check "stops while www points elsewhere" "$(has "$out" "www.accucery.com doesn't point at this server yet")"
check "without an IP in the message" "$(lacks "$out" "$OTHER_IP")"
check "having changed nothing" "$(same "$BOX/sites/accucery.real" "$BOX/original-site")"
check "nor asked for a certificate" "$(lacks "$(calls)" "certbot")"
rm -rf "$BOX"

setup
out=$(SW_CODE=404 run)
check "stops until the handover is deployed" "$(has "$out" "Merge and deploy the #200 pull request first")"
check "having changed nothing" "$(same "$BOX/sites/accucery.real" "$BOX/original-site")"
rm -rf "$BOX"

setup
out=$(CERTBOT_FAIL=1 run)
check "stops when certbot fails" "$(has "$out" "certbot couldn't get a certificate")"
check "having changed nothing" "$(same "$BOX/sites/accucery.real" "$BOX/original-site")"
rm -rf "$BOX"

setup
sed -i 's#^FRONTEND_URL=.*#FRONTEND_URL=https://accucery.com#' "$BOX/app/.env"
out=$(run)
check "refuses to move to where it already is" "$(has "$out" "nothing to move")"
rm -rf "$BOX"

# --- Putting things back -----------------------------------------------------
setup
out=$(HEALTH_CODE=502 run); status=$?
check "an unhealthy backend puts everything back" "$(has "$out" "Restored from")"
check "the site as it was" "$(same "$BOX/sites/accucery.real" "$BOX/original-site")"
check "the .env as it was" "$(same "$BOX/app/.env" "$BOX/original-env")"
check "and reports failure" "$([ $status != 0 ] && echo 1 || echo 0)"
rm -rf "$BOX"

setup
out=$(NGINX_REJECT="handoff/send" run); status=$?
check "nginx rejecting the handover puts everything back" "$(has "$out" "Restored from")"
check "the site as it was" "$(same "$BOX/sites/accucery.real" "$BOX/original-site")"
check "the .env as it was" "$(same "$BOX/app/.env" "$BOX/original-env")"
rm -rf "$BOX"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
