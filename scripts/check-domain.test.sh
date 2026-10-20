#!/usr/bin/env bash
# Offline test for scripts/check-domain.sh. No network, no real nginx.
#
#   bash scripts/check-domain.test.sh
#
# Its output goes to a PUBLIC issue, so the cases that matter most are that no
# IP address survives, and that DNS is judged without printing one. To check a
# case still bites, delete the mask() call at the end of check-domain.sh: the
# "no IP address" case must fail.

set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/check-domain.sh"
PASS=0; FAIL=0
HERE_IP="203.0.113.7"
OTHER_IP="198.51.100.9"

setup() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/bin" "$BOX/sites"
  printf 'FRONTEND_URL=https://accucery.old.example\nFRONTEND_PORT=127.0.0.1:8082\n' > "$BOX/.env"
  cat > "$BOX/sites/accucery" <<CONF
# the app
server {
    listen $HERE_IP:443 ssl;
    listen [::]:443 ssl;
    server_name accucery.old.example;
    location / { proxy_pass http://127.0.0.1:8082; }
}
CONF
  cat > "$BOX/sites/other" <<'CONF'
server { server_name blog.example; location / { proxy_pass http://127.0.0.1:9000; } }
CONF
  cat > "$BOX/bin/curl" <<STUB
#!/usr/bin/env bash
echo "$HERE_IP"
STUB
  cat > "$BOX/bin/getent" <<'STUB'
#!/usr/bin/env bash
case "$2" in
  accucery.com) [ -n "${APEX:-}" ] && echo "$APEX STREAM accucery.com" ;;
  www.accucery.com) [ -n "${WWW:-}" ] && echo "$WWW STREAM www.accucery.com" ;;
esac
exit 0
STUB
  cat > "$BOX/bin/certbot" <<'STUB'
#!/usr/bin/env bash
cat <<OUT
  Certificate Name: accucery.old.example
    Domains: accucery.old.example
    Expiry Date: 2027-01-18 10:00:00+00:00 (VALID: 89 days)
OUT
STUB
  cat > "$BOX/bin/ss" <<STUB
#!/usr/bin/env bash
echo "LISTEN 0 511 0.0.0.0:80 0.0.0.0:*"
echo "LISTEN 0 511 $HERE_IP:443 0.0.0.0:*"
STUB
  cat > "$BOX/bin/ufw" <<'STUB'
#!/usr/bin/env bash
echo "Status: active"; echo "Nginx Full   ALLOW   Anywhere"
STUB
  cat > "$BOX/bin/nginx" <<'STUB'
#!/usr/bin/env bash
echo "nginx: configuration file /etc/nginx/nginx.conf test is successful" >&2
STUB
  chmod +x "$BOX/bin/"*
}

run() {
  PATH="$BOX/bin:$PATH" NGINX_DIRS="$BOX/sites" ENV_FILE="$BOX/.env" bash "$SRC" accucery.com
}

check() {
  local name="$1" ok="$2"
  if [ "$ok" = 1 ]; then PASS=$((PASS + 1)); echo "ok   $name"; else FAIL=$((FAIL + 1)); echo "FAIL $name"; fi
}
has() { grep -qF -- "$2" <<<"$1" && echo 1 || echo 0; }
lacks() { grep -qF -- "$2" <<<"$1" && echo 0 || echo 1; }

setup
out=$(APEX="$HERE_IP" WWW="$OTHER_IP" run)
check "no IP address in the output" "$(lacks "$out" "$HERE_IP")"
check "no other IP address either" "$(lacks "$out" "$OTHER_IP")"
check "no IPv6 either" "$(lacks "$out" "[::]")"
check "keeps the expiry time readable" "$(has "$out" "10:00:00")"
check "names the current address" "$(has "$out" "FRONTEND_URL host: accucery.old.example")"
check "shows the app's own site file" "$(has "$out" "server_name accucery.old.example;")"
check "leaves out another site's file" "$(lacks "$out" "proxy_pass http://127.0.0.1:9000")"
check "still lists another site's name" "$(has "$out" "server_name blog.example;")"
check "drops comments" "$(lacks "$out" "# the app")"
check "the apex points here" "$(has "$out" "accucery.com: points here")"
check "www points elsewhere" "$(has "$out" "www.accucery.com: points elsewhere")"
check "lists certificates" "$(has "$out" "Certificate Name: accucery.old.example")"
check "port 443 open" "$(has "$out" "port 443: open")"
check "nginx test shown" "$(has "$out" "test is successful")"

out=$(run)
check "a name with no record is not set yet" "$(has "$out" "accucery.com: not set yet")"
rm -rf "$BOX"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
