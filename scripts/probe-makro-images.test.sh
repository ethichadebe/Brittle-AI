#!/usr/bin/env bash
# Offline test for scripts/probe-makro-images.sh. No network.
#
#   bash scripts/probe-makro-images.test.sh
#
# The fixtures below are INVENTED. They prove the probe reports whatever an
# image sits under, at a path nobody told it about, with the host and any
# template placeholder intact. They do NOT claim Makro's real shape - that is
# the live run's job, and writing a plausible fixture and believing it is
# exactly how makro.ts shipped reading an imageUrl that does not exist.

set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/probe-makro-images.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }
has()     { if printf '%s' "$2" | grep -qF -- "$1"; then ok "$3"; else bad "$3" "expected \"$1\""; fi; }
hasnt()   { if printf '%s' "$2" | grep -qF -- "$1"; then bad "$3" "found \"$1\""; else ok "$3"; fi; }

run_fixture() { # run_fixture <html>
  D="$(mktemp -d)"; printf '%s' "$1" > "$D/search.html"
  PROBE_FIXTURE_DIR="$D" bash "$SRC" 2>&1
  rm -rf "$D"
}

# The image is nested under a key the probe was never told about, carries
# Flipkart-style {@width} placeholders, and lives on a different host from the
# store - all three of the things that broke this before.
prod() {  # prod <id> <name>
  cat <<JSON
{"productId":"$1","titles":{"title":"$2"},
 "pricing":{"prices":[{"priceType":"FSP","value":42.5}]},
 "media":{"assets":[{"kind":"PRIMARY",
   "src":"https://cdn.example-assets.net/img/{@width}/{@height}/$1.jpeg?q={@quality}"}]},
 "analytics":{"impressionUrl":"https://track.example.com/e?id=$1"}}
JSON
}

echo "image found at an unexpected path"
OUT="$(run_fixture "<html><script>window.__INITIAL_STATE__ = {\"widgets\":[{\"data\":{\"items\":[$(prod A1 Eggs),$(prod A2 Milk)]}}]};</script></html>")"
has "product-shaped: 2"            "$OUT" "finds both products"
has "media.assets[0].src"          "$OUT" "reports the real path"
has "cdn.example-assets.net"       "$OUT" "reports the host"
has "YES in"                       "$OUT" "flags template placeholders"
has "2/2"                          "$OUT" "says how many carry it"
hasnt "track.example.com"          "$OUT" "ignores a tracking pixel url"

echo
echo "no image anywhere in the product"
BARE='{"productId":"B1","titles":{"title":"Eggs"},"pricing":{"prices":[{"priceType":"FSP","value":9}]}}'
OUT="$(run_fixture "<html><script>window.__INITIAL_STATE__ = {\"items\":[$BARE]};</script></html>")"
has "product-shaped: 1"            "$OUT" "still finds the product"
has "NONE in any product"          "$OUT" "says plainly there is no image"

echo
echo "a plain imageUrl, the shape makro.ts assumed"
PLAIN='{"productId":"C1","title":"Eggs","imageUrl":"https://www.makro.co.za/p/c1.jpg","pricing":{"prices":[{"priceType":"FSP","value":9}]}}'
OUT="$(run_fixture "<html><script>window.__INITIAL_STATE__ = {\"items\":[$PLAIN]};</script></html>")"
has "imageUrl"                     "$OUT" "would have reported it"
has "www.makro.co.za"              "$OUT" "and its host"
has "none"                         "$OUT" "no placeholders to flag"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
