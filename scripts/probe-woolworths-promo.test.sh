#!/usr/bin/env bash
# Offline test for scripts/probe-woolworths-promo.sh. No network, no key.
#
#   bash scripts/probe-woolworths-promo.test.sh
#
# The fixtures below are INVENTED. They do NOT claim Woolworths' real shape -
# the whole reason this probe exists is that nobody has seen inside
# product_promo_info. What they prove is that the probe reaches the RIGHT
# CONCLUSION from a given response, including the conclusions that say "cannot
# tell" and "no".
#
# The field values it must read are known from the live probe: p10/p30/p60 and
# a promo array of marketing copy. The structure of product_promo_info is not,
# so the test plants it at a path nobody chose in advance.

set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/probe-woolworths-promo.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }
has()   { if printf '%s' "$2" | grep -qF -- "$1"; then ok "$3"; else bad "$3" "expected \"$1\""; fi; }
hasnt() { if printf '%s' "$2" | grep -qF -- "$1"; then bad "$3" "found \"$1\""; else ok "$3"; fi; }

run() { # run <results-json>
  D="$(mktemp -d)"
  printf '{"response":{"results":[%s]}}' "$1" > "$D/search.json"
  PROBE_FIXTURE_DIR="$D" bash "$SRC" 2>&1
  rm -rf "$D"
}

# prod <id> <p10> <p30> <p60> <now> <save> [ppi-json]
prod() {
  local ppi=""
  [ -n "${7:-}" ] && ppi=",\"product_promo_info\":$7"
  cat <<JSON
{"value":"Item $1","data":{"id":"$1","prodtype":"Food",
 "p10":$2,"p30":$3,"p60":$4,
 "promo":["WRewards","Now R$5 Save R$6 Item $1"]$ppi}}
JSON
}

# plain <id> <p60> — not promoted at all
plain() {
  printf '{"value":"Item %s","data":{"id":"%s","prodtype":"Food","p60":%s,"promo":[]}}' "$1" "$1" "$2"
}

echo "names the zone that equals Now+Save"
# p30 is the only zone equal to now+save on BOTH products. p10 matches the
# first by luck, which is exactly the coincidence the all-or-nothing rule is
# there to reject.
OUT="$(run "$(prod A 126.99 126.99 140.00 99.99 27.00),$(prod B 50.00 80.00 90.00 60.00 20.00)")"
has "=> p30 is the regular price" "$OUT" "picks p30"
hasnt "=> p60" "$OUT" "does not pick the current default"
has "promoted w/ Now+Save: 2" "$OUT" "counted both promoted products"

echo
echo "a zone matching only some products is not an answer"
hasnt "=> p10" "$OUT" "p10 matched one, not named"

echo
echo "says so when the zones cannot be told apart"
# All three zones agree, so all three 'match'. That is not evidence.
OUT2="$(run "$(prod C 126.99 126.99 126.99 99.99 27.00)")"
has "all agree here" "$OUT2" "reports the ambiguity"
hasnt "is the regular price" "$OUT2" "does not name a winner"
has "unlucky sample" "$OUT2" "calls it an unlucky sample"

echo
echo "tells an unlucky sample from a method that cannot work"
# The live run on 2026-09-21 looked like this: every PROMOTED product had
# identical zones, while plenty of unpromoted ones did not. That is not bad
# luck - it says promotions are priced nationally, so no number of retries
# will ever separate the zones this way.
NATIONAL="$(run "$(prod P1 126.99 126.99 126.99 99.99 27.00),$(prod P2 50.00 50.00 50.00 40.00 10.00),$(plain U1 45.99),{\"value\":\"u2\",\"data\":{\"id\":\"U2\",\"p10\":45.99,\"p30\":39.99,\"p60\":39.99,\"promo\":[]}}")"
has "promoted items never" "$NATIONAL" "names the real cause"
has "not another" "$NATIONAL" "says retrying will not help"
hasnt "unlucky sample" "$NATIONAL" "does not blame the sample"
has "promoted: 0/2" "$NATIONAL" "counts promoted zone spread"
has "all:      1/4" "$NATIONAL" "counts catalogue zone spread"

echo
echo "says so when no zone matches"
OUT3="$(run "$(prod D 10.00 20.00 30.00 99.99 27.00)")"
has "no zone matches" "$OUT3" "reports the miss"
has "miss: want 126.99" "$OUT3" "shows what it wanted"

echo
echo "says so when nothing is promoted"
OUT4="$(run "$(plain E 45.99),$(plain F 32.50)")"
has "promoted w/ Now+Save: 0" "$OUT4" "counts zero"
has "try another" "$OUT4" "suggests another query"
has "absent on every product" "$OUT4" "and no promo info"

echo
echo "prints product_promo_info wherever it sits"
PPI='{"offer":{"tiers":[{"label":"WRewards","amount":99.99}]},"ends":"2026-10-01"}'
OUT5="$(run "$(prod G 126.99 126.99 126.99 99.99 27.00 "$PPI")")"
has "offer.tiers[0].amount" "$OUT5" "reports a path nobody named"
has "offer.tiers[0].label" "$OUT5" "and its siblings"
has "2026-10-01" "$OUT5" "and non-price values"

echo
echo "shows every distinct value a field takes"
# The live run printed `loyalty false` from one sample and gave no way to tell
# whether any product carried `true` — which is the whole question for #28.
#
# The live 2026-09-21 run printed lowercase `false`, so Woolworths sends these
# as STRINGS, not JSON booleans — a JSON boolean would render as Python's
# `False`. Using the real shape here rather than the one I first assumed.
VARIED='{"offer":{"tiers":[{"label":"WRewards","amount":99.99}]},"loyalty":"false"}'
VARIED2='{"offer":{"tiers":[{"label":"WRewards","amount":99.99}]},"loyalty":"true"}'
OUTV="$(run "$(prod V1 126.99 126.99 126.99 99.99 27.00 "$VARIED"),$(prod V2 126.99 126.99 126.99 99.99 27.00 "$VARIED2")")"
has "false | true" "$OUTV" "both values of a flag are shown"

echo
echo "answers the question behind #28"
has "=> read this, not the copy" "$OUT5" "finds the matching leaf"
# Same structure, but the amount does NOT equal the copy's Now price.
PPI2='{"offer":{"tiers":[{"label":"WRewards","amount":12.34}]},"ends":"2026-10-01"}'
OUT6="$(run "$(prod H 126.99 126.99 126.99 99.99 27.00 "$PPI2")")"
has "keep parsing it" "$OUT6" "says no when no leaf matches"
hasnt "=> read this" "$OUT6" "does not claim a structured price"

echo
echo "a product not sold in one zone still resolves"
# p10 is 0 because the product is not sold there. The answer comes from p30.
#
# This does NOT test a special case for zero, and an earlier version of this
# file claimed it did: removing the zero check left all tests passing, because
# 0 can never equal a positive now+save. The probe now says so in a comment
# instead of carrying a guard no test can exercise.
OUT7="$(run "$(prod I 0 27.00 90.00 20.00 7.00)")"
has "=> p30 is the regular price" "$OUT7" "resolves from the zone that has it"

echo
echo "a non-numeric zone value does not crash it"
# This is what the safe conversion is actually for. Replacing num() with a bare
# float() dies here with ValueError, which is how the guard was shown to be
# load-bearing after the zero check turned out not to be.
OUT8="$(run '{"value":"x","data":{"id":"X","p10":"n/a","p30":27.00,"p60":90,"promo":["Now R20.00 Save R7.00 x"]}}')"
hasnt "Traceback" "$OUT8" "no traceback"
has "=> p30 is the regular price" "$OUT8" "still answers from the good zones"

echo
echo "output fits a phone"
WIDE="$(printf '%s' "$OUT5" | awk '{ if (length($0) > 40) print length($0)": "$0 }')"
if [ -z "$WIDE" ]; then ok "all lines <= 40 columns"
else bad "all lines <= 40 columns" "$(printf '%s' "$WIDE" | head -3)"; fi

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
