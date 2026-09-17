#!/usr/bin/env bash
# What search platform does a store run, and does a parser we already have fit?
#
#   cd /opt/accucery && bash scripts/probe-store.sh https://www.spar.co.za milk
#
# This is the generalised form of the probe that added Woolworths. It was
# probe-woolworths.sh, copied from probe-shoprite.sh; a third copy was not worth
# keeping in sync, and the question is the same for every store:
#
#   1. is the runner's network fine           (free baseline, no credits)
#   2. is the store reachable, or WAF'd
#   3. does it serve the Shoprite-group endpoint
#   4. what does its search page say it runs
#   5. does shopriteGroup.ts or pnp.ts normalise() fit what comes back
#
# It does NOT decide anything. Read the output and write the parser from it. An
# untested assumption cost this project four months, and the two that looked
# most certain this week - that Woolworths would be nothing like Pick n Pay, and
# that p10_wp was the loyalty price - were both wrong.
#
# Credits: everything is tried on the direct IP first, which is free. ScraperAPI
# is used only for a step the WAF blocked, at most MAX_CREDITS times, and every
# spend is printed. NO_SCRAPERAPI=1 turns the fallback off entirely.
#
# Prints no secrets: status codes, sizes, hostnames and JSON field names only.
# Output stays under 40 columns, like smoke-scrapers.sh, so it can be read and
# pasted from a phone. The closing notes print only to a terminal, so piping
# this into sed or awk gives you data and nothing else.

set -uo pipefail

STORE_URL="${1:-}"
QUERY="${2:-milk}"
MAX_CREDITS="${MAX_CREDITS:-3}"
NO_SCRAPERAPI="${NO_SCRAPERAPI:-}"

if [ -z "$STORE_URL" ]; then
  echo "usage: bash scripts/probe-store.sh <https://store.co.za> [query]"
  exit 2
fi
STORE_URL="${STORE_URL%/}"
LABEL="$(printf '%s' "$STORE_URL" | sed 's|https\?://||; s|^www\.||')"

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf 0 > "$TMP/credits"

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

# SCRAPERAPI_KEY is optional. Parsed literally, never sourced: the .env also holds
# cookie lines full of semicolons and spaces.
SCRAPERAPI_KEY=""
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; *=*) ;; *) continue ;; esac
    k=${line%%=*}; v=${line#*=}
    case "$v" in \"*\") v=${v#\"}; v=${v%\"} ;; esac
    [ "$k" = "SCRAPERAPI_KEY" ] && SCRAPERAPI_KEY=$(printf '%s' "$v" | sed 's/\$\$/$/g')
  done < .env
fi

urlenc() { printf '%s' "$1" | sed 's|%|%25|g; s| |%20|g; s|:|%3A|g; s|/|%2F|g; s|?|%3F|g; s|&|%26|g; s|=|%3D|g'; }
short() { printf '%s' "$1" | cut -c1-"${2:-38}"; }
ctype() {
  case "$1" in
    *json*) printf json ;; *html*) printf html ;; *xml*) printf xml ;;
    ""|-)   printf -    ;; *)      printf other ;;
  esac
}

# A WAF answers 403/202/429, or 200 with a challenge page in the body.
#
# The body scan only applies to SMALL responses. A challenge page is a few KB; a
# real storefront is hundreds. Makro's 2.5MB homepage was classified as blocked
# because somewhere in it the word "captcha" appears - a login form's reCAPTCHA
# is enough - so the probe threw away a page it had just paid a credit for and
# reported that nothing answered.
CHALLENGE_MAX_BYTES=50000

# Bot defences that do NOT look like a WAF. blocked() asks whether THIS response
# was a challenge page; these serve a normal 200, then run a JS sensor and gate
# the API behind a cookie it mints. Game reported "WAF: no sign of one" while
# shipping PerimeterX and rendering the word "Detecting..." on screen, which is
# that sensor running - so a clean [2] was read as "free to scrape" when the
# catalogue was never reachable without executing their JavaScript.
#
# Matched on the sensor's own URL shape or global, not on a vendor name in a
# comment: "px/PX<appid>/init.js" is PerimeterX's, and _px3 is its cookie.
botdefence() {  # botdefence <file> -> prints each defence found, one per line
  local f="$1"
  grep -qiE 'px/PX[A-Za-z0-9]+/init\.js|_px3|perimeterx' "$f" 2>/dev/null && echo "perimeterx"
  grep -qiE 'datadome|dd_cookie' "$f" 2>/dev/null && echo "datadome"
  grep -qiE 'kasada|/149e9513-01fa' "$f" 2>/dev/null && echo "kasada"
  grep -qiE '_abck|akam/[0-9]+/' "$f" 2>/dev/null && echo "akamai-bot-manager"
  grep -qiE 'challenges\.cloudflare\.com|turnstile' "$f" 2>/dev/null && echo "cloudflare-turnstile"
  grep -qiE 'hcaptcha|recaptcha/api\.js' "$f" 2>/dev/null && echo "captcha-widget"
  return 0
}

blocked() {
  case "$1" in 403|429|202|503) return 0 ;; esac
  local size
  size=$(wc -c < "$2" 2>/dev/null || echo 0)
  [ "${size:-0}" -gt "$CHALLENGE_MAX_BYTES" ] && return 1
  grep -qiE 'awswaf|incapsula|cf-browser|captcha|Request unsuccessful|Access Denied' \
    "$2" 2>/dev/null && return 0
  return 1
}

# fetch <outfile> <url> [post-body] -> "code|content_type|bytes|via|waf|final_url".
# Pipe-separated because content_type carries "; charset=utf-8" - a space.
# waf reports whether the DIRECT attempt was turned away, which a later proxy
# success would otherwise hide. final_url is last so it can contain anything.
#
# Redirects are followed: spar.co.za answers / with a 302 to a 122-byte stub, and
# without -L the probe fingerprinted the stub and reported that nothing answered.
fetch() {
  local out="$1" url="$2" data="${3:-}" code ctype final via="direct" waf="no"
  : > "$out"
  local -a args=(-sL --max-redirs 5 -o "$out"
                 -w '%{http_code}|%{content_type}|%{url_effective}' -m 90
                 -H "User-Agent: $UA" -H 'Accept-Language: en-ZA,en;q=0.9')
  if [ -n "$data" ]; then
    args+=(-X POST -H 'Content-Type: application/json'
           -H "Origin: $STORE_URL" -H "Referer: $STORE_URL/" --data "$data")
  fi
  IFS='|' read -r code ctype final <<<"$(curl "${args[@]}" "$url" 2>/dev/null || echo '000|-|-')"

  if blocked "$code" "$out"; then
    waf="yes"
    # The counter lives in a file: fetch runs inside $( ), so a variable
    # incremented here would die with the subshell and under-report the spend.
    local spent; spent=$(cat "$TMP/credits")
    if [ -z "$NO_SCRAPERAPI" ] && [ -n "$SCRAPERAPI_KEY" ] && \
       [ "$spent" -lt "$MAX_CREDITS" ]; then
      printf '%s' "$((spent + 1))" > "$TMP/credits"; via="scraperapi"
      IFS='|' read -r code ctype final <<<"$(curl "${args[@]}" \
        "http://api.scraperapi.com/?api_key=${SCRAPERAPI_KEY}&url=$(urlenc "$url")&keep_headers=true" \
        2>/dev/null || echo '000|-|-')"
    fi
  fi
  # Belt and braces: suppress the URL entirely when it came back through the
  # proxy, and strip any api_key that somehow survives into it anyway.
  if [ "$via" = scraperapi ]; then
    final="-"
  else
    final="$(printf '%s' "${final:-$url}" | sed 's/api_key=[^&]*/api_key=REDACTED/g')"
  fi
  printf '%s|%s|%s|%s|%s|%s' "$code" "${ctype:--}" \
    "$(wc -c < "$out" 2>/dev/null || echo 0)" "$via" "$waf" "$final"
}

printf 'Accucery probe: %s\n' "$(short "$LABEL" 24)"
printf 'query: %-14s %s\n' "$(short "$QUERY" 14)" "$(date +%Y-%m-%d)"
printf '%s\n' '--------------------------------------'

# [1] Baseline. Pick n Pay's Constructor endpoint is free and is a parser we know
# works, so a failure here means the run is wrong, not that the store is
# interesting. Checkers would have cost a credit just to prove the network works.
printf '\n[1] net baseline (PnP, 0 credits)\n'
# Same value as backend/src/scraper/pnp.ts: served in pnp.co.za's own public
# frontend bundle, so it is an identifier, not a credential.
PNP_PUBLIC_KEY="key_yMuER1c8l84k40e3" # gitleaks:allow — public key served in pnp.co.za's own frontend bundle
IFS="|" read -r code ctype bytes via waf final <<<"$(fetch "$TMP/pnp.json" \
  "https://ac.cnstrc.com/search/$(urlenc "$QUERY")?key=${PNP_PUBLIC_KEY}&num_results_per_page=5")"
n=$(python3 -c 'import json,sys
try: print(len(json.load(open(sys.argv[1]))["response"]["results"]))
except Exception: print(0)' "$TMP/pnp.json")
if [ "$code" = "200" ] && [ "${n:-0}" -gt 0 ]; then
  printf '    HTTP %-5s n=%-4s OK\n' "$code" "$n"
else
  printf '    HTTP %-5s n=%-4s FAIL\n' "$code" "$n"
  printf '    network is wrong, not the store\n'
  exit 1
fi

# [2] Reachable at all from this IP?
printf '\n[2] reachable?\n'
IFS="|" read -r code ctype bytes via waf final <<<"$(fetch "$TMP/home.html" "$STORE_URL/")"
printf '    HTTP %-5s %-5s %sB\n' "$code" "$(ctype "$ctype")" "$bytes"
printf '    via  %s\n' "$via"
if [ "${final%/}" != "${STORE_URL%/}" ] && [ -n "$final" ] && [ "$final" != "-" ]; then
  printf '    landed on:\n'
  printf '      %s\n' "$(short "$(printf '%s' "$final" | sed 's|https\?://||')" 32)"
fi
if [ "$waf" = yes ]; then
  printf '%s\n' '    WAF: yes (like Checkers)'
  printf '%s\n' '    -> costs a credit per search'
else
  printf '%s\n' '    WAF: no sign of one'
  DEFENCES="$(botdefence "$TMP/home.html" | paste -sd, -)"
  if [ -n "$DEFENCES" ]; then
    # The page came back, which is not the same as the catalogue being reachable.
    printf '    bot JS: %s\n' "$(short "$DEFENCES" 26)"
    printf '%s\n' '    -> HTML is free, but the API is'
    printf '%s\n' '       likely gated behind that'
    printf '%s\n' '       sensor. Needs a real browser.'
  else
    printf '%s\n' '    -> free to scrape directly'
  fi
fi

# [3] Shoprite-group endpoint? A yes means the store is a third Site constant in
# shopriteGroup.ts rather than a new file.
printf '\n[3] shoprite-group endpoint?\n'
SG_BODY=$(printf '{"storeContexts":[],"filterData":{"filter":{"showAllDisplayVariants":false,"showNotRangedProducts":false,"productListSource":{"search":"%s"},"paginationOptions":{"page":0,"pageSize":5},"filterOptions":{"filterIds":[],"dealsOnly":false,"brandOptions":[],"departmentOptions":[],"serviceOptions":[],"facetOptions":[]},"sortOptions":null},"displayOptions":{"includeDisplayCategoryTree":false}},"forYouBonusBuyIds":[],"url":null}' "$QUERY")
IFS="|" read -r code ctype bytes via waf final <<<"$(fetch "$TMP/sg.json" "$STORE_URL/api/catalogue/get-products-filter" "$SG_BODY")"
printf '    HTTP %-5s %-5s %sB\n' "$code" "$(ctype "$ctype")" "$bytes"
if [ "$code" = "200" ] && printf '%s' "$ctype" | grep -qi json; then
  printf '%s\n' '    -> JSON came back, see [5]'
  cp "$TMP/sg.json" "$TMP/candidate.json"
else
  printf '%s\n' '    -> no; not the Checkers platform'
fi

# [4] The page names whatever it loads results from. This is the step that does
# not guess. Woolworths was found this way: its page referenced cnstrc.com.
printf '\n[4] search page fingerprint\n'
FOUND=""
for path in "/search?q=$QUERY" "/cat?Ntt=$QUERY" "/catalogue/search?q=$QUERY" "/products?q=$QUERY"; do
  IFS="|" read -r code ctype bytes via waf final <<<"$(fetch "$TMP/s.html" "$STORE_URL$path")"
  printf '    %-5s %-18s %sB\n' "$code" "$(short "${path%%\?*}" 18)" "$bytes"
  if [ "$code" = "200" ] && [ "${bytes:-0}" -gt 2000 ] && ! blocked "$code" "$TMP/s.html"; then
    cp "$TMP/s.html" "$TMP/search.html"; FOUND=yes; break
  fi
done

if [ -z "$FOUND" ] && [ -s "$TMP/home.html" ] \
   && [ "$(wc -c < "$TMP/home.html")" -gt 2000 ] \
   && ! blocked 200 "$TMP/home.html"; then
  cp "$TMP/home.html" "$TMP/search.html"
  FOUND=home
  printf '%s\n' '    no search path answered;'
  printf '%s\n' '    using the homepage from [2]'
fi

if [ -n "$FOUND" ]; then
  printf '\n    platforms named in the page:\n'
  hit=0
  # Substrings, not exact hosts. "ac.cnstrc.com" missed Woolworths, which
  # references the bare domain, and the probe printed "none recognised" directly
  # above a host list containing cnstrc.com.
  for f in "cnstrc:constructor(PnP)" "algolia:algolia" "searchspring:searchspring" \
           "unbxd:unbxd" "bloomreach:bloomreach" "klevu:klevu" "graphql:graphql" \
           "__NEXT_DATA__:next.js" "__NUXT__:nuxt" "shopify:shopify" \
           "magento:magento" "get-products-filter:shoprite-grp" \
           "flixcart:flipkart(Makro)" "flipkart:flipkart(Makro)" \
           "useinsider:insider(personalisation)"; do
    if grep -qi "${f%%:*}" "$TMP/search.html"; then
      printf '      %s\n' "${f##*:}"; hit=1
    fi
  done
  [ "$hit" = 0 ] && printf '      none recognised\n'

  printf '\n    bot defences named in the page:\n'
  SEARCH_DEFENCES="$(botdefence "$TMP/search.html")"
  if [ -n "$SEARCH_DEFENCES" ]; then
    printf '%s\n' "$SEARCH_DEFENCES" | sed 's/^/      /'
  else
    printf '      none recognised\n'
  fi

  printf '\n    third-party hosts referenced:\n'
  grep -oE 'https?://[a-zA-Z0-9.-]+' "$TMP/search.html" \
    | sed 's|https\?://||' | grep -viF "$LABEL" | cut -c1-32 | sort -u | head -12 \
    | sed 's/^/      /'
  printf '\n    api-ish paths in the page:\n'
  # Opening quote only, and no query string: "/api/x?q=milk" must still match,
  # and truncating before de-duplicating keeps distinct paths from collapsing
  # into identical-looking lines.
  grep -oE "[\"']/[a-zA-Z0-9/_.-]*(api|search|product)[a-zA-Z0-9/_.-]*" "$TMP/search.html" \
    | tr -d "\"'" | cut -c1-32 | sort -u | head -6 | sed 's/^/      /'
else
  printf '%s\n' '    no search page answered'
  printf '%s\n' '    (need 200, >2KB, no WAF page)'
fi

# [5] Measure whatever JSON we captured against the parsers we already have.
printf '\n[5] which parser fits?\n'
if [ -f "$TMP/candidate.json" ]; then
  python3 - "$TMP/candidate.json" <<'PY'
import json, sys, textwrap

def wrap(xs, ind="      "):
    xs = [str(x) for x in xs if x is not None]
    if not xs: return [ind + "(none)"]
    return textwrap.wrap(" ".join(xs), 38 - len(ind),
                         initial_indent=ind, subsequent_indent=ind)

try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("    not JSON (%s)" % type(e).__name__); raise SystemExit

print("    top-level keys:")
for l in wrap(list(d)[:10]): print(l)

cands = [("products", d.get("products")),
         ("data.products", (d.get("data") or {}).get("products")),
         ("results", d.get("results")),
         ("response.results", (d.get("response") or {}).get("results"))]
items = where = None
for name, v in cands:
    if isinstance(v, list) and v:
        items, where = v, name; break
if not items:
    print("    no product list found")
    print("    -> needs its own parser")
    raise SystemExit
print("    %d items, list at .%s" % (len(items), where))

n = len(items)
# Every field counted across all results, never just the first: a loyalty price
# exists only on promoted items, and reading result zero hid exactly that on
# Woolworths.
allkeys = set()
for x in items:
    allkeys |= set((x.get("data") or x).keys() if isinstance(x, dict) else [])
print("    all keys:")
for l in wrap(sorted(allkeys)[:24]): print(l)

p = items[0]
data = p.get("data") if isinstance(p.get("data"), dict) else p
img = [f for f in ("imageProductCardURL", "imageURL") if f in p]
sg = [("id", "id" in p), ("name", "name" in p),
      ("image", bool(img)), ("price", "price" in p)]
print("    shopriteGroup normalise:")
for label, ok in sg:
    print("      %-6s %s" % (label, "yes" if ok else "NO"))
sg_score = sum(1 for _, ok in sg if ok)
print("      -> %d/4" % sg_score)

pnp = [("value", "value" in p), ("data.id", "id" in data),
       ("image_url", "image_url" in data), ("priceValue", "priceValue" in data)]
print("    pnp normalise:")
for label, ok in pnp:
    print("      %-11s %s" % (label, "yes" if ok else "NO"))
pnp_score = sum(1 for _, ok in pnp if ok)
print("      -> %d/4" % pnp_score)

if sg_score == 4:
    print("    VERDICT shopriteGroup site")
elif pnp_score == 4:
    print("    VERDICT pnp shape")
else:
    print("    VERDICT own parser needed")

# The price is often under a name nobody would guess: Woolworths used p10/p30/p60
# and no key contained "price" at all.
money = [k for k in allkeys if any(w in k.lower() for w in
         ("price", "promo", "reward", "loyal", "member", "sav", "discount", "amount"))]
print("    price/loyalty-ish keys:")
for l in wrap(sorted(money)): print(l)
PY
else
  printf '    no JSON captured yet\n'
  printf '    use [4] hosts and paths to pick\n'
  printf '    the real endpoint, then probe\n'
  printf '    that directly next round\n'
fi

printf '\n%s\n' '--------------------------------------'
spent="$(cat "$TMP/credits")"
printf 'credits spent: %s (cap %s)\n' "$spent" "$MAX_CREDITS"
if [ "$spent" -ge "$MAX_CREDITS" ]; then
  printf 'cap reached: steps after this ran\n'
  printf 'direct and were blocked. Rerun\n'
  printf 'with MAX_CREDITS=8 to finish.\n'
fi

if [ -t 1 ]; then
cat <<'NOTE'

How to read this:

Step 4 is the one that matters when
step 5 is empty. Whatever the page
loads results from is named in its
own HTML, so a platform there means
that platform's API is the real
endpoint to probe next.

Step 5 tells you which parser fits
only for the endpoint step 3 tried.
A verdict of "own parser" is the
normal outcome for a store outside
the two groups we already have.

Step 2 says whether the store costs
ScraperAPI credits. Checkers and
Shoprite do; Woolworths does not.

These notes print only on a real
terminal, so piping this into sed or
awk never shows them.
NOTE
fi
