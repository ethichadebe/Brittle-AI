#!/usr/bin/env bash
# Read-only: what the move to a new domain (#200) needs to know about this
# server. Changes nothing.
#
#   cd /opt/accucery && bash scripts/report.sh 200 -- bash scripts/check-domain.sh accucery.com
#
# THIS IS POSTED TO A PUBLIC REPOSITORY. So it prints no IP address: every
# IPv4 and IPv6 in its output is masked, and DNS is reported only as "points
# here", "points elsewhere" or "not set yet", never by address. It prints no
# file that holds a key: only nginx site files and certbot's summary.
#
# Tested offline by scripts/check-domain.test.sh.

set -uo pipefail

NEW="${1:-accucery.com}"
NGINX_DIRS="${NGINX_DIRS:-/etc/nginx/sites-enabled /etc/nginx/conf.d}"
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env}"

# Times like 10:00:00 have two colons, so an IPv6 needs three or more, or "::".
mask() {
  sed -E \
    -e 's/([0-9]{1,3}\.){3}[0-9]{1,3}/[ip]/g' \
    -e 's/([0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{1,4}/[ip6]/g' \
    -e 's/[0-9a-fA-F:]*::[0-9a-fA-F:]*/[ip6]/g'
}

say() { printf '%s\n' "$*"; }

{
  say "Domain check for $NEW (read-only)"

  say ""
  say "== The app's address now"
  port=""
  if [ -f "$ENV_FILE" ]; then
    url=$(grep -E '^FRONTEND_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')
    host=${url#*://}; host=${host%%/*}
    say "FRONTEND_URL host: ${host:-not set}"
    port=$(grep -E '^FRONTEND_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')
    say "FRONTEND_PORT: ${port:-not set (80)}"
  else
    say "no .env found"
  fi

  say ""
  say "== nginx sites that serve this app"
  found=0
  match="accucery"
  [ -n "$port" ] && match="$match|127\.0\.0\.1:${port##*:}([^0-9]|\$)"
  for dir in $NGINX_DIRS; do
    [ -d "$dir" ] || continue
    for f in "$dir"/*; do
      [ -f "$f" ] || continue
      if grep -qiE "$match" "$f" 2>/dev/null; then
        found=1
        say "-- $f"
        grep -vE '^\s*(#|$)' "$f"
      fi
    done
  done
  [ "$found" = 1 ] || say "none found"

  say ""
  say "== Every site name on this server"
  for dir in $NGINX_DIRS; do
    [ -d "$dir" ] && grep -ohE 'server_name[^;]*;' "$dir"/* 2>/dev/null | sort -u
  done

  say ""
  say "== HTTPS certificates"
  if command -v certbot >/dev/null 2>&1; then
    certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry Date' | sed -E 's/^\s+//'
  else
    say "certbot not installed"
  fi

  say ""
  say "== DNS for $NEW"
  here=$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)
  for name in "$NEW" "www.$NEW"; do
    addrs=$(getent ahostsv4 "$name" 2>/dev/null | awk '{print $1}' | sort -u)
    if [ -z "$addrs" ]; then
      say "$name: not set yet"
    elif [ -z "$here" ]; then
      say "$name: set, but this server's own address couldn't be read to compare"
    elif printf '%s\n' "$addrs" | grep -qxF "$here"; then
      say "$name: points here"
    else
      say "$name: points elsewhere"
    fi
  done

  say ""
  say "== Listening"
  for p in 80 443; do
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p\$"; then say "port $p: open"; else say "port $p: closed"; fi
  done
  if command -v ufw >/dev/null 2>&1; then
    say "firewall: $(ufw status 2>/dev/null | head -1)"
    ufw status 2>/dev/null | grep -E '\b(80|443)\b|Nginx' | sed -E 's/\s+/ /g'
  fi

  say ""
  say "== nginx config test"
  nginx -t 2>&1 | tail -2
} 2>&1 | mask
