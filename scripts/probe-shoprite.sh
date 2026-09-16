#!/usr/bin/env bash
# Does Shoprite expose the same catalogue API as Checkers, with the same shape?
#
#   cd /opt/accucery && bash scripts/probe-shoprite.sh
#
# Checkers and Shoprite are both Shoprite Holdings and look like the same
# platform, so the scraper may be reusable as-is. "Looks like" is not evidence.
# This asks the actual endpoint and reports what came back.
#
# Reads SCRAPERAPI_KEY from .env literally — never sources it — and prints no
# secrets: status codes, whether the body parsed as JSON, product counts, and
# the field names of the first product.

set -uo pipefail

CHECKERS_URL="https://www.checkers.co.za/api/catalogue/get-products-filter"
SHOPRITE_URL="https://www.shoprite.co.za/api/catalogue/get-products-filter"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
QUERY="${1:-milk}"

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }
[ -f .env ] || { echo "Run this from the directory holding .env (/opt/accucery)."; exit 1; }

# Literal parse; the cookie line contains semicolons and spaces.
SCRAPERAPI_KEY=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; *=*) ;; *) continue ;; esac
  k=${line%%=*}; v=${line#*=}
  case "$v" in \"*\") v=${v#\"}; v=${v%\"} ;; esac
  [ "$k" = "SCRAPERAPI_KEY" ] && SCRAPERAPI_KEY=$(printf '%s' "$v" | sed 's/\$\$/$/g')
done < .env

[ -n "$SCRAPERAPI_KEY" ] || { echo "SCRAPERAPI_KEY not found in .env"; exit 1; }

body() {
  printf '{"storeContexts":%s,"filterData":{"filter":{"showAllDisplayVariants":false,"showNotRangedProducts":false,"productListSource":{"search":"%s"},"paginationOptions":{"page":0,"pageSize":5},"filterOptions":{"filterIds":[],"dealsOnly":false,"brandOptions":[],"departmentOptions":[],"serviceOptions":[],"facetOptions":[]},"sortOptions":null},"displayOptions":{"includeDisplayCategoryTree":false}},"forYouBonusBuyIds":[],"url":null}' "$1" "$2"
}

urlenc() { printf '%s' "$1" | sed 's|:|%3A|g; s|/|%2F|g; s|?|%3F|g; s|&|%26|g'; }

probe() {
  local label="$1" url="$2" out="/tmp/probe-$3.json"
  local code
  code=$(curl -s -o "$out" -w '%{http_code}' -m 120 -X POST \
    "http://api.scraperapi.com/?api_key=${SCRAPERAPI_KEY}&url=$(urlenc "$url")&keep_headers=true" \
    -H "User-Agent: $UA" -H 'Content-Type: application/json' \
    -H "Origin: ${url%/api/*}" -H "Referer: ${url%/api/*}/search" \
    --data "$(body '[]' "$QUERY")" || true)

  printf '\n%s\n' "$label"
  printf '  HTTP           : %s\n' "$code"
  printf '  bytes          : %s\n' "$(wc -c < "$out" 2>/dev/null || echo 0)"
  python3 - "$out" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("  JSON           : NO (%s)" % type(e).__name__)
    print("  first 120 bytes: %s" % open(sys.argv[1], errors="replace").read(120).replace("\n", " "))
    raise SystemExit
print("  JSON           : yes")
print("  top-level keys : %s" % ", ".join(list(d)[:8]))
ps = None
for k in ("products", "results", "data"):
    if isinstance(d.get(k), list):
        ps, key = d[k], k
        break
if ps is None:
    print("  products       : none found under products/results/data")
    raise SystemExit
print("  products       : %d (under '%s')" % (len(ps), key))
if ps:
    print("  first product  : %s" % ", ".join(list(ps[0])[:12]))
    # These are the fields backend/src/scraper/checkers.ts normalise() reads.
    need = ["id", "name", "imageProductCardURL", "imageURL", "price", "bonusBuy"]
    have = [f for f in need if f in ps[0]]
    miss = [f for f in need if f not in ps[0]]
    print("  parser needs   : present %s" % (", ".join(have) or "none"))
    if miss:
        print("                 : absent  %s" % ", ".join(miss))
PY
  rm -f "$out"
}

printf 'Probing for query "%s" with empty storeContexts.\n' "$QUERY"
probe "CHECKERS (known-good baseline)" "$CHECKERS_URL" checkers
probe "SHOPRITE (the question)"        "$SHOPRITE_URL" shoprite

cat <<'NOTE'

How to read this:
  Both JSON with the same first-product fields -> the Checkers parser reuses
  as-is, and the two stores differ only by base URL and cookie.

  Shoprite 0 products but HTTP 200 -> the endpoint is right and it wants a
  storeContexts value of its own; capture one from shoprite.co.za the same way
  you did for Checkers.

  Shoprite 404 or HTML -> different platform, and it needs its own scraper.
NOTE
