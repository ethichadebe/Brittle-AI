#!/usr/bin/env bash
# Live test of the store scrapers against a running Accucery.
#
#   bash scripts/smoke-scrapers.sh                      # defaults to the container
#   bash scripts/smoke-scrapers.sh http://your-host     # or through nginx
#
# Reads no config and touches no credentials — it only calls the app's own API,
# exactly as the frontend does. Scraping is slow, so allow a couple of minutes.

set -uo pipefail

BASE="${1:-http://127.0.0.1:8082}"
STORES="checkers pick-n-pay"
QUERIES="milk bread coffee"

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

printf 'Testing %s\n\n' "$BASE"
printf '%-12s %-8s %6s %5s %5s  %s\n' STORE QUERY HTTP SECS N SAMPLE
printf '%s\n' "------------------------------------------------------------------------"

PASS=0; FAIL=0; LOYALTY=0

for store in $STORES; do
  for q in $QUERIES; do
    start=$(date +%s)
    code=$(curl -s -o /tmp/smoke.json -w '%{http_code}' -m 180 \
      "$BASE/api/search?store=$store&q=$q")
    secs=$(( $(date +%s) - start ))

    read -r n loy sample <<EOF
$(python3 - <<'PY'
import json
try:
    d = json.load(open("/tmp/smoke.json"))
    ps = d.get("products")
    if not isinstance(ps, list):
        print("0 0 " + ("error:" + str(d.get("error", "unexpected-shape"))))
    else:
        loy = sum(1 for p in ps if p.get("loyaltyPrice") is not None)
        s = "-"
        if ps:
            s = "%s @R%s" % (str(ps[0].get("name", "?"))[:34], ps[0].get("regularPrice"))
        print("%d %d %s" % (len(ps), loy, s))
except Exception as e:
    print("0 0 unparseable:" + type(e).__name__)
PY
)
EOF

    printf '%-12s %-8s %6s %4ss %5s  %s\n' "$store" "$q" "$code" "$secs" "$n" "$sample"
    if [ "$code" = "200" ] && [ "${n:-0}" -gt 0 ]; then
      PASS=$((PASS+1)); LOYALTY=$((LOYALTY + ${loy:-0}))
    else
      FAIL=$((FAIL+1))
    fi
  done
done

rm -f /tmp/smoke.json

printf '\n%s\n' "------------------------------------------------------------------------"
printf 'passed %s / %s   (a pass means HTTP 200 with at least one product)\n' \
  "$PASS" "$((PASS+FAIL))"
printf 'products carrying a loyalty price: %s\n' "$LOYALTY"
if [ "$LOYALTY" -eq 0 ]; then
  printf '  ^ none seen. May be correct for these items, but issue #7 is about\n'
  printf '    loyalty pricing, so try a product you know has an Xtra Savings promo.\n'
fi
[ "$FAIL" -eq 0 ] || printf '\nFAILURES — check: docker compose -f docker-compose.prod.yml logs --tail=40 backend\n'
exit 0
