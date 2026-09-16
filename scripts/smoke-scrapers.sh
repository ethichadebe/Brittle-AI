#!/usr/bin/env bash
# Live test of the store scrapers against a running Accucery.
#
#   bash scripts/smoke-scrapers.sh                      # defaults to the container
#   bash scripts/smoke-scrapers.sh http://your-host     # or through nginx
#
# Output is deliberately under 40 columns so it is readable — and screenshottable
# — in a phone terminal, which is how this repo is usually driven.
#
# Reads no config and touches no credentials: it only calls the app's own API,
# exactly as the frontend does. Scraping is slow, so allow a couple of minutes.

set -uo pipefail

BASE="${1:-http://127.0.0.1:8082}"
STORES="checkers pick-n-pay"
QUERIES="milk bread coffee"

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

printf 'Accucery scraper smoke test\n%s\n\n' "$BASE"

PASS=0; FAIL=0; LOYALTY=0; SAMPLE=""

for store in $STORES; do
  short=$store
  [ "$store" = "pick-n-pay" ] && short="pnp"
  for q in $QUERIES; do
    start=$(date +%s)
    code=$(curl -s -o /tmp/smoke.json -w '%{http_code}' -m 180 \
      "$BASE/api/search?store=$store&q=$q")
    secs=$(( $(date +%s) - start ))

    parsed=$(python3 - <<'PY'
import json
try:
    d = json.load(open("/tmp/smoke.json"))
    ps = d.get("products")
    if not isinstance(ps, list):
        print("0|0|%s" % str(d.get("error", "bad-shape"))[:24])
    else:
        loy = sum(1 for p in ps if p.get("loyaltyPrice") is not None)
        s = ""
        if ps:
            s = "%s R%s" % (str(ps[0].get("name", "?"))[:30], ps[0].get("regularPrice"))
        print("%d|%d|%s" % (len(ps), loy, s))
except Exception as e:
    print("0|0|unparseable-" + type(e).__name__)
PY
)
    n=${parsed%%|*}; rest=${parsed#*|}
    loy=${rest%%|*}; note=${rest#*|}

    if [ "$code" = "200" ] && [ "${n:-0}" -gt 0 ]; then
      printf '%-9s %-6s %s %2ss n=%-3s L=%s\n' "$short" "$q" "$code" "$secs" "$n" "$loy"
      PASS=$((PASS+1)); LOYALTY=$((LOYALTY + ${loy:-0}))
      [ -z "$SAMPLE" ] && SAMPLE="$note"
    else
      printf '%-9s %-6s %s %2ss FAIL\n' "$short" "$q" "$code" "$secs"
      [ -n "$note" ] && printf '   %s\n' "$note"
      FAIL=$((FAIL+1))
    fi
  done
done

rm -f /tmp/smoke.json

printf '\n'
if [ "$FAIL" -eq 0 ]; then
  printf 'PASS %s/%s   loyalty: %s\n' "$PASS" "$((PASS+FAIL))" "$LOYALTY"
else
  printf 'FAIL %s of %s failed\n' "$FAIL" "$((PASS+FAIL))"
fi
[ -n "$SAMPLE" ] && printf '%s\n' "$SAMPLE"
if [ "$PASS" -gt 0 ] && [ "$LOYALTY" -eq 0 ]; then
  printf 'no loyalty prices seen (issue #7)\n'
fi
[ "$FAIL" -eq 0 ] || printf 'logs:\n  docker logs accucery-backend-1 -n 40\n'
exit 0
