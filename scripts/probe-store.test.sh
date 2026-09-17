#!/usr/bin/env bash
# Offline test for probe-store.sh's detectors. No network.
#
#   bash scripts/probe-store.test.sh
#
# Covers the two functions that decide a store's verdict, because both have
# been wrong in production and each wrong answer cost a round of somebody's
# attention:
#
#   blocked()    once called Makro's 2.5MB homepage a WAF challenge, because
#                the word "captcha" appears somewhere in a page that big.
#   botdefence() exists because probe-store.sh told us Game was "free to scrape
#                directly" while the page shipped PerimeterX and rendered
#                "Detecting..." on screen.
#
# The functions are pulled out of the real script rather than copied, so this
# cannot pass against a version of the script it no longer matches.

set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/probe-store.sh"
CHALLENGE_MAX_BYTES=50000
eval "$(sed -n '/^botdefence() {/,/^}/p' "$SRC")"
eval "$(sed -n '/^blocked() {/,/^}/p' "$SRC")"
declare -F botdefence >/dev/null || { echo "could not extract botdefence()"; exit 1; }
declare -F blocked   >/dev/null || { echo "could not extract blocked()"; exit 1; }

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

F="$(mktemp -d)"; trap 'rm -rf "$F"' EXIT
page() { printf '%s' "$2" > "$F/$1"; printf '%s' "$F/$1"; }

defends() { # defends <file> <expected> <name>
  local got; got="$(botdefence "$1" | paste -sd, -)"
  [ "$got" = "$2" ] && ok "$3" || bad "$3" "expected \"$2\", got \"$got\""
}

echo "botdefence"
# The exact script tag Game serves. The app id varies per customer, so the
# pattern must match the shape, not this one string.
defends "$(page px '<script src="px/PXBIA59zcf/init.js"></script>')" \
  perimeterx "names PerimeterX from its sensor tag"
defends "$(page px2 '<script src="px/PXfffQQQ123/init.js"></script>')" \
  perimeterx "matches a different PerimeterX app id"
defends "$(page px3 'document.cookie.match(/_px3=([^;]+)/)')" \
  perimeterx "names PerimeterX from its cookie"
defends "$(page dd '<script src="https://js.datadome.co/tags.js"></script>')" \
  datadome "names DataDome"
defends "$(page clean '<html><body>Milk R21.99</body></html>')" \
  "" "stays quiet on an ordinary page"

echo
echo "blocked() is unchanged by any of this"
# The Makro regression: a big page mentioning a captcha widget is a storefront,
# not a challenge. botdefence may still name it - that is the point of them
# being separate - but blocked() must not reject the page.
BIG="$F/big"; { printf '<html>'; head -c 200000 /dev/zero | tr '\0' 'x'; printf 'recaptcha/api.js</html>'; } > "$BIG"
if blocked 200 "$BIG"; then bad "a 200KB page with a captcha widget is not blocked" "it was"; else ok "a 200KB page with a captcha widget is not blocked"; fi
defends "$BIG" captcha-widget "but the captcha widget is still named"

SMALL="$(page chal '<html>Request unsuccessful. awswaf token</html>')"
if blocked 200 "$SMALL"; then ok "a small awswaf challenge is still blocked"; else bad "a small awswaf challenge is still blocked" "it was not"; fi
if blocked 403 "$(page ok200 'fine')"; then ok "a 403 is still blocked whatever the body"; else bad "a 403 is still blocked whatever the body" "it was not"; fi

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
