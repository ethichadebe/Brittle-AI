#!/usr/bin/env bash
# Offline test for scripts/smoke-scrapers.sh. No network, no running app.
#
#   bash scripts/smoke-scrapers.test.sh
#
# curl is stubbed on PATH and writes a canned /api/search response, so the
# script runs its real code path without a store, a container or a credit. The
# store config is a fixture too, which is the point: the loyalty warning is only
# correct if it follows STORE_CONFIGS rather than a second list.
#
# It exists because the warning was wrong and nothing caught it. Makro has no
# loyalty programme, so a run over Makro reported "no loyalty prices seen
# (issue #7)" every single time - a real signal turned into noise.

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/smoke-scrapers.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }
has()   { if printf '%s' "$2" | grep -qF -- "$1"; then ok "$3"; else bad "$3" "expected \"$1\""; fi; }
hasnt() { if printf '%s' "$2" | grep -qF -- "$1"; then bad "$3" "found \"$1\""; else ok "$3"; fi; }

# A cut-down stores.ts carrying the two cases that matter, plus the comment that
# says "loyalty-capable" - the real file has one, and a parser that reads
# comments would get Makro exactly backwards.
STORES_TS="$(mktemp -d)/stores.ts"
cat > "$STORES_TS" <<'TS'
export const STORE_CONFIGS: StoreConfig[] = [
  {
    slug: "checkers",
    name: "Checkers",
    active: true,
    loyaltyProgramme: "Xtra Savings",
  },
  {
    slug: "makro",
    name: "Makro",
    active: true,
    // A store listed here appears in Settings as loyalty-capable, which Makro
    // is not. loyaltyProgramme: "Makro Rewards" would be wrong.
    loyaltyProgramme: null,
  },
];
TS

# run <stores> <loyalty-in-response> [stores-ts]
run() {
  D="$(mktemp -d)"
  cat > "$D/curl" <<STUB
#!/usr/bin/env bash
# Writes the canned body to whatever -o names, then prints the status code.
out=""; prev=""
for a in "\$@"; do [ "\$prev" = "-o" ] && out="\$a"; prev="\$a"; done
[ -n "\$out" ] && cat "$D/body.json" > "\$out"
printf '200'
STUB
  chmod +x "$D/curl"
  if [ "$2" = "yes" ]; then
    printf '{"products":[{"name":"Milk 2L","regularPrice":32.99,"loyaltyPrice":28.99}]}' > "$D/body.json"
  else
    printf '{"products":[{"name":"Milk 2L","regularPrice":32.99,"loyaltyPrice":null}]}' > "$D/body.json"
  fi
  PATH="$D:$PATH" STORES="$1" QUERIES="milk" \
    SMOKE_STORES_TS="${3:-$STORES_TS}" bash "$SRC" 2>&1
  rm -rf "$D"
}

echo "a store with no loyalty programme does not cry wolf"
OUT="$(run makro no)"
hasnt "issue #7" "$OUT" "no false alarm for Makro"
has "loyalty: n/a" "$OUT" "says the check does not apply"
has "PASS" "$OUT" "the run still passes"

echo
echo "a store that HAS a programme still reports the real problem"
OUT="$(run checkers no)"
has "issue #7" "$OUT" "warns for Checkers"
has "checkers" "$OUT" "names which store was expected"
hasnt "loyalty: n/a" "$OUT" "does not claim n/a"

echo
echo "a mixed run follows the store that has a card"
OUT="$(run "checkers makro" no)"
has "issue #7" "$OUT" "warns when any store has one"
has "expected from: checkers" "$OUT" "names only the loyalty store"

echo
echo "loyalty prices present means no warning at all"
OUT="$(run checkers yes)"
hasnt "issue #7" "$OUT" "silent when loyalty is seen"
hasnt "loyalty: n/a" "$OUT" "and does not say n/a either"

echo
echo "an unreadable config says so rather than guessing"
OUT="$(run checkers no /nonexistent/stores.ts)"
hasnt "issue #7" "$OUT" "does not warn on a guess"
hasnt "loyalty: n/a" "$OUT" "does not suppress on a guess"
has "config unreadable" "$OUT" "says the check did not run"

echo
echo "a config it cannot parse is also not a guess"
EMPTY="$(mktemp -d)/stores.ts"
printf 'export const STORE_CONFIGS = [];\n' > "$EMPTY"
OUT="$(run checkers no "$EMPTY")"
has "config unreadable" "$OUT" "empty config is unreadable, not n/a"

echo
echo "output fits a phone"
WIDE="$(run "checkers makro" no | awk '{ if (length($0) > 40) print length($0)": "$0 }')"
if [ -z "$WIDE" ]; then ok "all lines <= 40 columns"
else bad "all lines <= 40 columns" "$(printf '%s' "$WIDE" | head -3)"; fi

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
