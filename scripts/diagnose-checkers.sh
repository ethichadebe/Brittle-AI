#!/usr/bin/env bash
# Diagnose why the Checkers scraper works locally but not on the VPS.
#
# Run it ON THE VPS, from the repo directory that holds your .env:
#   bash scripts/diagnose-checkers.sh
#
# It never prints secrets — only whether they are set, how long they are, and
# what the stores answer. Paste the "Captured" block back to whoever is helping.

set -uo pipefail

SEARCH_URL="https://www.checkers.co.za/api/catalogue/get-products-filter"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"

say() { printf '\n>>> %s\n' "$1"; }

# Read .env WITHOUT sourcing it. Compose parses these as literal KEY=VALUE, but
# `.` makes bash execute them: CHECKERS_COOKIES is one unquoted line full of
# semicolons and spaces, so sourcing it runs fragments as commands and prints
# the cookie to the terminal. Parse by hand, execute nothing.
if [ -f .env ]; then
  ENV_FILE="found"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    case "$line" in *=*) ;; *) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    key=${key# }; key=${key%% }
    # Strip one layer of surrounding quotes if present.
    case "$val" in \"*\") val=${val#\"}; val=${val%\"} ;; esac
    case "$key" in
      SCRAPERAPI_KEY|CHECKERS_COOKIES|FRONTEND_URL) printf -v "$key" '%s' "$val" ;;
    esac
  done < .env
else
  ENV_FILE="MISSING (run this from the directory holding your .env)"
fi

# Normalise so `set -u` and ${#VAR} are safe whether or not .env defined them.
SCRAPERAPI_KEY="${SCRAPERAPI_KEY:-}"      # gitleaks:allow — shell default, not a value
CHECKERS_COOKIES="${CHECKERS_COOKIES:-}"  # gitleaks:allow — shell default, not a value

say "1. Environment"
printf '   .env                : %s\n' "$ENV_FILE"
printf '   SCRAPERAPI_KEY set  : %s (%s chars)\n' \
  "$([ -n "$SCRAPERAPI_KEY" ] && echo yes || echo NO)" "${#SCRAPERAPI_KEY}"
printf '   CHECKERS_COOKIES set: %s (%s chars)\n' \
  "$([ -n "$CHECKERS_COOKIES" ] && echo yes || echo NO)" "${#CHECKERS_COOKIES}"

# THE KEY CHECK. Even when routing through ScraperAPI the code does not send
# cookies as a header, but it still parses storeContexts *out of the same
# CHECKERS_COOKIES value* and puts it in the POST body. No storeContexts means
# Checkers does not know which store to price, and answers with nothing.
if [ -z "$CHECKERS_COOKIES" ]; then
  HAS_STORECTX="n/a — CHECKERS_COOKIES is empty"
elif printf '%s' "$CHECKERS_COOKIES" | grep -q 'storeContexts='; then
  HAS_STORECTX=yes
else
  HAS_STORECTX="NO  <-- prime suspect"
fi
printf '   storeContexts in it : %s\n' "$HAS_STORECTX"

if printf '%s' "${CHECKERS_COOKIES:-}" | grep -q 'aws-waf-token='; then
  HAS_WAF=yes
else
  HAS_WAF=no
fi
printf '   aws-waf-token in it : %s (IP-bound; expected to be useless here)\n' "$HAS_WAF"

say "2. Can this box reach the internet at all?"
EGRESS=$(curl -s -o /dev/null -w '%{http_code}' -m 20 https://example.com/ || true)
printf '   example.com         : HTTP %s\n' "$EGRESS"

touch /tmp/dc.out /tmp/sa.out /tmp/app.out

say "3. Direct to Checkers from this IP (expected to fail — datacenter IP)"
DIRECT=$(curl -s -o /tmp/dc.out -w '%{http_code}' -m 40 -X POST "$SEARCH_URL" \
  -H "User-Agent: $UA" -H 'Content-Type: application/json' \
  -H 'Origin: https://www.checkers.co.za' -H 'Referer: https://www.checkers.co.za/search' \
  --data '{"storeContexts":[],"filterData":{"filter":{"productListSource":{"search":"milk"},"paginationOptions":{"page":0,"pageSize":5}}}}' || true)
printf '   direct POST         : HTTP %s, %s bytes\n' "$DIRECT" "$(wc -c < /tmp/dc.out 2>/dev/null || echo 0)"
printf '   first 160 bytes     : %s\n' "$(head -c 160 /tmp/dc.out 2>/dev/null | tr -d '\n')"

say "4. Through ScraperAPI (the path the VPS actually uses)"
if [ -z "${SCRAPERAPI_KEY:-}" ]; then
  SA="skipped — no SCRAPERAPI_KEY"
  printf '   %s\n' "$SA"
else
  SA=$(curl -s -o /tmp/sa.out -w '%{http_code}' -m 90 -X POST \
    "http://api.scraperapi.com/?api_key=${SCRAPERAPI_KEY}&url=$(printf '%s' "$SEARCH_URL" | sed 's|:|%3A|g; s|/|%2F|g')&keep_headers=true" \
    -H "User-Agent: $UA" -H 'Content-Type: application/json' \
    -H 'Origin: https://www.checkers.co.za' -H 'Referer: https://www.checkers.co.za/search' \
    --data "{\"storeContexts\":$(printf '%s' "${CHECKERS_COOKIES:-}" | grep -o 'storeContexts=[^;]*' | cut -d= -f2- | python3 -c 'import sys,urllib.parse; v=sys.stdin.read().strip(); print(urllib.parse.unquote(v) if v else "[]")' 2>/dev/null || echo '[]'),\"filterData\":{\"filter\":{\"productListSource\":{\"search\":\"milk\"},\"paginationOptions\":{\"page\":0,\"pageSize\":5}}}}" || true)
  printf '   scraperapi POST     : HTTP %s, %s bytes\n' "$SA" "$(wc -c < /tmp/sa.out 2>/dev/null || echo 0)"
  printf '   looks like JSON?    : %s\n' "$(head -c 1 /tmp/sa.out 2>/dev/null | grep -q '[{[]' && echo yes || echo 'NO — probably an HTML error page')"
  printf '   product count       : %s\n' "$(python3 -c 'import json,sys
try:
    d=json.load(open("/tmp/sa.out"))
    for k in ("products","results"):
        if isinstance(d.get(k),list): print(len(d[k])); break
    else: print("0 (keys: " + ",".join(list(d)[:6]) + ")")
except Exception as e: print("unparseable: " + type(e).__name__)' 2>/dev/null)"
  printf '   first 200 bytes     : %s\n' "$(head -c 200 /tmp/sa.out 2>/dev/null | tr -d '\n')"
fi

say "5. What the running app says"
APP=$(curl -s -o /tmp/app.out -w '%{http_code}' -m 120 'http://localhost/api/search?store=checkers&q=milk' || true)
printf '   app /search         : HTTP %s\n' "$APP"
printf '   body (200 bytes)    : %s\n' "$(head -c 200 /tmp/app.out 2>/dev/null | tr -d '\n')"
printf '   backend log tail    :\n'
COMPOSE_LOGS=$(docker compose -f docker-compose.prod.yml logs --tail=15 backend 2>&1) || COMPOSE_LOGS=""
if [ -n "$COMPOSE_LOGS" ]; then
  printf '%s\n' "$COMPOSE_LOGS" | sed 's/^/     /'
else
  printf '     (no output — is the stack running? try: docker compose -f docker-compose.prod.yml ps)\n'
fi

rm -f /tmp/dc.out /tmp/sa.out /tmp/app.out

printf '\n--- Captured (paste this back) ---\n'
printf 'ENV_FILE=%s\n' "$ENV_FILE"
printf 'SCRAPERAPI_KEY_SET=%s\n' "$([ -n "${SCRAPERAPI_KEY:-}" ] && echo yes || echo no)"
printf 'CHECKERS_COOKIES_LEN=%s\n' "${#CHECKERS_COOKIES}"
printf 'HAS_STORECONTEXTS=%s\n' "$HAS_STORECTX"
printf 'HAS_WAF_TOKEN=%s\n' "$HAS_WAF"
printf 'EGRESS=%s\n' "$EGRESS"
printf 'DIRECT_HTTP=%s\n' "$DIRECT"
printf 'SCRAPERAPI_HTTP=%s\n' "${SA:-skipped}"
printf 'APP_HTTP=%s\n' "$APP"
