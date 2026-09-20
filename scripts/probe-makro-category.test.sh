#!/usr/bin/env bash
# Offline test for scripts/probe-makro-category.sh. No network.
#
#   bash scripts/probe-makro-category.test.sh
#
# The fixtures below are INVENTED. They do NOT claim Makro's real shape - that
# is the live run's whole job, and writing a plausible fixture and believing it
# is exactly how makro.ts shipped reading an imageUrl that does not exist.
#
# What they prove is that the probe answers the question CORRECTLY whichever way
# the live page turns out:
#
#   - a field that separates food from non-food is reported, even when it is
#     nested under a key nobody named and sits beside decoys;
#   - a field that is present on every product but always says the same thing is
#     NOT reported as a filter;
#   - a field that varies without separating (a brand) is held back in [4];
#   - a page with no such field says so plainly, rather than nominating a decoy.

set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/probe-makro-category.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }
has()   { if printf '%s' "$2" | grep -qF -- "$1"; then ok "$3"; else bad "$3" "expected \"$1\""; fi; }
hasnt() { if printf '%s' "$2" | grep -qF -- "$1"; then bad "$3" "found \"$1\""; else ok "$3"; fi; }

# run_fixture <eggs-html> <milk-html>
run_fixture() {
  D="$(mktemp -d)"
  printf '%s' "$1" > "$D/search-eggs.html"
  printf '%s' "$2" > "$D/search-milk.html"
  PROBE_FIXTURE_DIR="$D" bash "$SRC" eggs milk 2>&1
  rm -rf "$D"
}

page() { printf '<html><script>window.__INITIAL_STATE__ = {"widgets":[{"data":{"items":[%s]}}]};</script></html>' "$1"; }

# A product carrying:
#   - the classification under a key nobody would grep for (browse.trail[0]),
#   - a decoy that never varies (availability),
#   - a decoy that varies but does not separate (brand),
#   - the noise a real page carries (a review, an id, a price).
prod() { # prod <id> <name> <trail> <brand>
  cat <<JSON
{"productId":"$1","titles":{"title":"$2"},
 "pricing":{"prices":[{"priceType":"FSP","value":42.5}]},
 "browse":{"trail":["$3","Sub Aisle 7"]},
 "availability":"IN_STOCK",
 "brand":"$4",
 "reviews":{"mostHelpful":{"author":"A shopper","text":"Worth spending the money on, arrived quickly and well packed"}}}
JSON
}

echo "a separating field is found"
# Three products a side, because a classification is recognised by GROUPING and
# two products cannot show that. Brands repeat within a query and overlap
# across them, so brand varies without separating - a decoy, not a filter.
OUT="$(run_fixture \
  "$(page "$(prod E1 'Egg Container' Homeware Addis),$(prod E2 'Egg Holder' Homeware Addis),$(prod E3 'Egg Tray' Homeware Clover)")" \
  "$(page "$(prod M1 'Full Cream Milk' Food Clover),$(prod M2 'Low Fat Milk' Food Clover),$(prod M3 'Fresh Milk' Food Addis)")")"
has "browse.trail[0]" "$OUT" "reports the nested path"
has "Homeware" "$OUT" "shows the non-food value"
has "Food" "$OUT" "shows the food value"
has "[5] verdict" "$OUT" "reaches a verdict"
has "a filter exists" "$OUT" "calls it a filter"
hasnt "[3] separating fields: 0" "$OUT" "does not report zero"

echo
echo "constant and non-separating decoys are not nominated"
# availability is on every product and never changes; brand varies per product
# but does not line up with food vs non-food.
SEP="$(printf '%s' "$OUT" | sed -n '/\[3\]/,/\[4\]/p')"
# A constant field can never be disjoint, so [3] would reject it anyway. What
# the constant rule actually buys is a clean [4]: without it every always-the-
# same flag floods the near-miss list and crowds out the real ones, which is
# twice now how a Makro probe hid its own answer. So assert it is absent from
# the WHOLE output, not just from [3] - otherwise this passes either way.
hasnt "availability" "$OUT" "constant field nowhere in output"
hasnt "brand" "$SEP" "varying-but-not-disjoint held back"
has "brand" "$OUT" "brand still shown under [4]"

echo
echo "a page with no such field says so"
bare() { # bare <id> <name>
  printf '{"productId":"%s","titles":{"title":"%s"},"pricing":{"prices":[{"priceType":"FSP","value":42.5}]},"availability":"IN_STOCK"}' "$1" "$2"
}
BARE="$(run_fixture \
  "$(page "$(bare E1 'Egg Container'),$(bare E2 'Egg Holder'),$(bare E3 'Egg Tray')")" \
  "$(page "$(bare M1 'Full Cream Milk'),$(bare M2 'Low Fat Milk'),$(bare M3 'Fresh Milk')")")"
has "[3] separating fields: 0" "$BARE" "reports none"
has "no category field here" "$BARE" "says so in the verdict"
hasnt "a filter exists" "$BARE" "does not claim a filter"

echo
echo "the title itself is not mistaken for a department"
# Every product has a distinct title, so titles are disjoint across queries by
# construction. Nominating one would be the "incidental property standing in
# for relevance" mistake the Makro probe already made twice.
TITLES="$(printf '%s' "$OUT" | sed -n '/\[3\]/,/\[4\]/p')"
hasnt "titles.title" "$TITLES" "title is not nominated"

echo
echo "output fits a phone"
WIDE="$(printf '%s' "$OUT" | awk '{ if (length($0) > 40) print length($0)": "$0 }')"
if [ -z "$WIDE" ]; then ok "all lines <= 40 columns"
else bad "all lines <= 40 columns" "$(printf '%s' "$WIDE" | head -3)"; fi

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
