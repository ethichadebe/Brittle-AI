#!/usr/bin/env bash
# Offline test for scripts/report.sh. No network, no GitHub, no real .env.
#
#   bash scripts/report.test.sh
#
# report.sh posts to a PUBLIC repository, so the thing worth testing is not
# that it posts - it is that a secret this box holds cannot ride along. Each
# case below plants a known value and asserts it is absent from the bytes that
# would have gone over the wire.
#
# To check a case still bites, break the thing it covers and re-run: delete the
# `text.replace(s, ...)` loop in report.sh and "masks a .env value" must fail
# naming the secret. A test that passes against a broken script is worse than
# no test - that is how the ScraperAPI key got printed in the first place.

set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/report.sh"
PASS=0; FAIL=0

# A sandbox report.sh: it finds .env by walking up from its own path, so a copy
# under <tmp>/scripts reads <tmp>/.env and never touches the real one.
setup() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/scripts" "$BOX/bin" "$BOX/cap"
  cp "$SRC" "$BOX/scripts/report.sh"
  cat > "$BOX/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$CAP/argv"
out=""; data=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    --data) data="$2"; shift 2 ;;
    *) shift ;;
  esac
done
cat > "$CAP/stdin"
case "$data" in @*) cp "${data#@}" "$CAP/posted.json" ;; esac
[ -n "$out" ] && printf '{"html_url":"https://example.invalid/c/1"}' > "$out"
printf '%s' "${FAKE_HTTP_CODE:-201}"
STUB
  chmod +x "$BOX/bin/curl"
  export CAP="$BOX/cap"
}

run() { PATH="$BOX/bin:$PATH" bash "$BOX/scripts/report.sh" "$@" >"$BOX/stdout" 2>&1; }

# The posted body, decoded out of the JSON payload the stub captured.
posted() {
  [ -f "$CAP/posted.json" ] || return 1
  python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["body"])' "$CAP/posted.json"
}

ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

check_absent() { # name needle haystack-file-or-string
  if printf '%s' "$3" | grep -qF -- "$2"; then bad "$1" "found \"$2\" in the posted body"; else ok "$1"; fi
}
check_present() {
  if printf '%s' "$3" | grep -qF -- "$2"; then ok "$1"; else bad "$1" "expected \"$2\" in the posted body"; fi
}

# ---------------------------------------------------------------- masking ---
echo "masking"
setup
# Deliberately low-entropy sentinels. A fixture shaped like a real
# credential trips the secret scanner in CI, and teaching anyone to wave
# that away is how a real one gets through.
cat > "$BOX/.env" <<'ENV'
# a comment, and a blank line follow

GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa
SCRAPERAPI_KEY=planted-aaaaaaaaaaaa
CHECKERS_COOKIES="quoted-bbbbbbbbbbbb"
SHORTVAL=seven77
POSTGRES_PASSWORD=pw$$cccccccccccc
ENV
run 12 -- sh -c 'echo "key is planted-aaaaaaaaaaaa"; echo "cookie quoted-bbbbbbbbbbbb"; echo "seven77 is fine"; echo "pw\$cccccccccccc"'
BODY="$(posted)"
check_absent  "masks a .env value"                 "planted-aaaaaaaaaaaa" "$BODY"
check_present "leaves a marker where it masked"    "***REDACTED***"       "$BODY"
check_absent  "masks a quoted .env value"          "quoted-bbbbbbbbbbbb"  "$BODY"
check_absent  "masks the \$\$-unescaped form too"  'pw$cccccccccccc'      "$BODY"
check_present "keeps short values readable"        "seven77"              "$BODY"
check_absent  "token never reaches curl's argv"    "tok_aaaaaaaaaaaaaaaaaaaa" "$(cat "$CAP/argv")"
check_present "token goes in via --config stdin"   "tok_aaaaaaaaaaaaaaaaaaaa" "$(cat "$CAP/stdin")"
rm -rf "$BOX"

# A shape that was never in .env at all.
setup
printf 'GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa\n' > "$BOX/.env"
run 12 -- sh -c 'echo "https://proxy.test/?api_key=NEVERINENV123&url=x"'
BODY="$(posted)"
check_absent  "masks api_key= not in .env" "NEVERINENV123" "$BODY"
check_present "keeps the rest of the url"  "url=x"         "$BODY"
rm -rf "$BOX"

# ---------------------------------------------------------------- refusal ---
echo "refusal"
setup
printf 'GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa\n' > "$BOX/.env"
run 12 -- sh -c 'echo "ghp_0123456789abcdefghijABCDEF"'
if [ -f "$CAP/posted.json" ]; then bad "refuses on a token shape" "it posted anyway"; else ok "refuses on a token shape"; fi
check_present "says why it refused" "REFUSING to post" "$(cat "$BOX/stdout")"
rm -rf "$BOX"

setup
printf 'GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa\n' > "$BOX/.env"
run 12 -- sh -c 'echo "-----BEGIN RSA PRIVATE KEY-----"'
if [ -f "$CAP/posted.json" ]; then bad "refuses on a private key" "it posted anyway"; else ok "refuses on a private key"; fi
rm -rf "$BOX"

# ------------------------------------------------------------ housekeeping ---
echo "housekeeping"
setup
printf 'NODE_ENV=production\n' > "$BOX/.env"
run 12 -- echo hi
if [ -f "$CAP/posted.json" ]; then bad "stops without a token" "it posted anyway"; else ok "stops without a token"; fi
check_present "explains how to make one" "Issues: read and write" "$(cat "$BOX/stdout")"
rm -rf "$BOX"

setup
printf 'GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa\n' > "$BOX/.env"
REPORT_MAX_BYTES=200 run 12 -- sh -c 'for i in $(seq 1 200); do echo "line $i padding padding"; done'
check_present "truncates a long report" "[truncated at 200 bytes]" "$(posted)"
rm -rf "$BOX"

setup
printf 'GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa\n' > "$BOX/.env"
run 12 -- sh -c 'printf "before\n```\nfenced\n```\nafter\n"'
check_present "widens the fence past backticks" '````' "$(posted)"
rm -rf "$BOX"

setup
printf 'GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa\n' > "$BOX/.env"
run 12 -- sh -c 'echo nope; exit 3'; RC=$?
if [ "$RC" = "3" ]; then ok "passes the command's exit status through"; else bad "passes the command's exit status through" "got $RC"; fi
check_present "records the status in the comment" "Exit status 3" "$(posted)"
rm -rf "$BOX"

setup
printf 'GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa\n' > "$BOX/.env"
run notanumber -- echo hi
check_present "rejects a non-numeric issue" "issue must be a number" "$(cat "$BOX/stdout")"
rm -rf "$BOX"

setup
printf 'GITHUB_REPORT_TOKEN=tok_aaaaaaaaaaaaaaaaaaaa\n' > "$BOX/.env"
FAKE_HTTP_CODE=404 run 12 -- echo hi
check_present "reports a failed post" "post failed: HTTP 404" "$(cat "$BOX/stdout")"
rm -rf "$BOX"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
