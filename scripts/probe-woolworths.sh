#!/usr/bin/env bash
# What search platform does Woolworths run, and does either parser we already
# have fit it?
#
#   cd /opt/accucery && bash scripts/probe-woolworths.sh [query]
#
# This is a DISCOVERY probe, not a confirmation one. probe-shoprite.sh could ask
# a known endpoint a yes/no question, because Checkers and Shoprite are the same
# company on the same platform. Woolworths is neither Shoprite Holdings nor on
# PnP's Constructor.io, so there is no endpoint to confirm — this finds out what
# is there, then measures it against the two parsers in backend/src/scraper/.
#
# It answers four things, in order:
#   1. is the runner's network fine          (free baseline, no credits)
#   2. is woolworths.co.za reachable, or WAF'd
#   3. does the Shoprite-group endpoint exist on it
#   4. what does the search page say it uses, and which parser fits
#
# Credits: everything is tried on the direct IP first, which is free. ScraperAPI
# is only used for a step the WAF blocked, at most MAX_CREDITS times, and every
# spend is printed. NO_SCRAPERAPI=1 turns the fallback off entirely.
#
# Prints no secrets: status codes, sizes, hostnames and JSON field names only.
# Output is kept under 40 columns, like smoke-scrapers.sh, to stay readable in a
# phone terminal.

set -uo pipefail

QUERY="${1:-milk}"
MAX_CREDITS="${MAX_CREDITS:-3}"
NO_SCRAPERAPI="${NO_SCRAPERAPI:-}"
WW="https://www.woolworths.co.za"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

printf 0 > "$TMP/credits"

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

# SCRAPERAPI_KEY is optional here. Parsed literally, never sourced: the .env also
# holds cookie lines full of semicolons and spaces.
SCRAPERAPI_KEY=""
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; *=*) ;; *) continue ;; esac
    k=${line%%=*}; v=${line#*=}
    case "$v" in \"*\") v=${v#\"}; v=${v%\"} ;; esac
    [ "$k" = "SCRAPERAPI_KEY" ] && SCRAPERAPI_KEY=$(printf '%s' "$v" | sed 's/\$\$/$/g')
  done < .env
fi

urlenc() { printf '%s' "$1" | sed 's|%|%25|g; s|:|%3A|g; s|/|%2F|g; s|?|%3F|g; s|&|%26|g; s|=|%3D|g'; }

# ---------------------------------------------------------------- helpers ----

# fetch <outfile> <url> [post-body] -> "code|content_type|bytes|via|waf".
# Pipe-separated because content_type carries "; charset=utf-8" — a space.
# waf reports whether the DIRECT attempt was turned away, which a later proxy
# success would otherwise hide — and whether Woolworths needs a residential
# proxy is one of the things this probe exists to find out.
fetch() {
  local out="$1" url="$2" data="${3:-}" code ctype via="direct" waf="no"
  # Truncate first: a curl that fails outright writes nothing, and a stale body
  # left by an earlier step would otherwise be read as this step's answer.
  : > "$out"
  local -a args=(-s -o "$out" -w '%{http_code} %{content_type}' -m 90
                 -H "User-Agent: $UA" -H 'Accept-Language: en-ZA,en;q=0.9')
  if [ -n "$data" ]; then
    args+=(-X POST -H 'Content-Type: application/json'
           -H "Origin: $WW" -H "Referer: $WW/" --data "$data")
  fi
  read -r code ctype <<<"$(curl "${args[@]}" "$url" 2>/dev/null || echo '000 -')"

  # Retry through the residential pool only if the direct IP was turned away.
  if blocked "$code" "$out"; then
    waf="yes"
    # The counter lives in a file: fetch runs inside $( ), so a shell variable
    # incremented here would die with the subshell and under-report the spend.
    local spent; spent=$(cat "$TMP/credits")
    if [ -z "$NO_SCRAPERAPI" ] && [ -n "$SCRAPERAPI_KEY" ] && \
       [ "$spent" -lt "$MAX_CREDITS" ]; then
      printf '%s' "$((spent + 1))" > "$TMP/credits"; via="scraperapi"
      read -r code ctype <<<"$(curl "${args[@]}" \
        "http://api.scraperapi.com/?api_key=${SCRAPERAPI_KEY}&url=$(urlenc "$url")&keep_headers=true" \
        2>/dev/null || echo '000 -')"
    fi
  fi
  printf '%s|%s|%s|%s|%s' "$code" "${ctype:--}" \
    "$(wc -c < "$out" 2>/dev/null || echo 0)" "$via" "$waf"
}

# A WAF answers 403/202/429, or 200 with a challenge page in the body.
blocked() {
  case "$1" in 403|429|202|503) return 0 ;; esac
  grep -qiE 'awswaf|incapsula|cf-browser|captcha|Request unsuccessful|Access Denied' \
    "$2" 2>/dev/null && return 0
  return 1
}

short() { printf '%s' "$1" | cut -c1-"${2:-38}"; }

# Content types are long and only their family matters here.
ctype() {
  case "$1" in
    *json*) printf json ;; *html*) printf html ;; *xml*) printf xml ;;
    ""|-)   printf -    ;; *)      printf other ;;
  esac
}

# ------------------------------------------------------------------ report ---

printf 'Accucery probe: Woolworths\n'
printf 'query: %-14s %s\n' "$QUERY" "$(date +%Y-%m-%d)"
printf '%s\n' '--------------------------------------'

# [1] Baseline. PnP's Constructor.io is free and is a parser we know works, so a
# failure here means the run is wrong, not that Woolworths is interesting.
printf '\n[1] net baseline (PnP, 0 credits)\n'
# Same value as backend/src/scraper/pnp.ts: Pick n Pay serves it in its own
# public frontend bundle, so it is an identifier, not a credential.
PNP_PUBLIC_KEY="key_yMuER1c8l84k40e3" # gitleaks:allow — public key served in pnp.co.za's own frontend bundle
IFS="|" read -r code ctype bytes via waf <<<"$(fetch "$TMP/pnp.json" \
  "https://ac.cnstrc.com/search/$(urlenc "$QUERY")?key=${PNP_PUBLIC_KEY}&num_results_per_page=5")"
n=$(python3 -c 'import json,sys
try: print(len(json.load(open(sys.argv[1]))["response"]["results"]))
except Exception: print(0)' "$TMP/pnp.json")
if [ "$code" = "200" ] && [ "${n:-0}" -gt 0 ]; then
  printf '    HTTP %-5s n=%-4s OK\n' "$code" "$n"
else
  printf '    HTTP %-5s n=%-4s FAIL\n' "$code" "$n"
  printf '    network is wrong, not Woolworths\n'
  printf '    stop here and fix the runner\n'
  exit 1
fi

# [2] Is the site reachable at all from this IP?
printf '\n[2] woolworths.co.za reachable?\n'
IFS="|" read -r code ctype bytes via waf <<<"$(fetch "$TMP/home.html" "$WW/")"
printf '    HTTP %-5s %-5s %sB\n' "$code" "$(ctype "$ctype")" "$bytes"
printf '    via  %s\n' "$via"
if [ "$waf" = yes ]; then
  printf '%s\n' '    WAF: yes (like Checkers)'
  printf '%s\n' '    -> costs a credit per search'
else
  printf '%s\n' '    WAF: no sign of one'
  printf '%s\n' '    -> free to scrape directly'
fi

# [3] Does the Shoprite-group endpoint exist here? Cheap to ask, and a yes would
# mean the fourth store is a third Site constant rather than a new file.
printf '\n[3] shoprite-group endpoint?\n'
SG_BODY=$(printf '{"storeContexts":[],"filterData":{"filter":{"showAllDisplayVariants":false,"showNotRangedProducts":false,"productListSource":{"search":"%s"},"paginationOptions":{"page":0,"pageSize":5},"filterOptions":{"filterIds":[],"dealsOnly":false,"brandOptions":[],"departmentOptions":[],"serviceOptions":[],"facetOptions":[]},"sortOptions":null},"displayOptions":{"includeDisplayCategoryTree":false}},"forYouBonusBuyIds":[],"url":null}' "$QUERY")
IFS="|" read -r code ctype bytes via waf <<<"$(fetch "$TMP/sg.json" "$WW/api/catalogue/get-products-filter" "$SG_BODY")"
printf '    HTTP %-5s %-5s %sB\n' "$code" "$(ctype "$ctype")" "$bytes"
if [ "$code" = "200" ] && printf '%s' "$ctype" | grep -qi json; then
  printf '%s\n' '    -> JSON came back, see [5]'
  cp "$TMP/sg.json" "$TMP/candidate.json"
else
  printf '%s\n' '    -> no; not the Checkers platform'
fi

# [4] What does the search page itself say it uses? This is the part that does
# not guess: whatever the page loads its results from is named in its own HTML.
printf '\n[4] search page fingerprint\n'
FOUND_HTML=""
for path in "/cat?Ntt=$QUERY" "/search?q=$QUERY" "/catalogue/search?q=$QUERY" "/cat/_/N-1z13sk5?Ntt=$QUERY"; do
  IFS="|" read -r code ctype bytes via waf <<<"$(fetch "$TMP/s.html" "$WW$path")"
  printf '    %-5s %-18s %sB\n' "$code" "$(short "${path%%\?*}" 18)" "$bytes"
  if [ "$code" = "200" ] && [ "${bytes:-0}" -gt 2000 ] && ! blocked "$code" "$TMP/s.html"; then
    FOUND_HTML="$TMP/s.html"; cp "$TMP/s.html" "$TMP/search.html"; break
  fi
done

if [ -n "$FOUND_HTML" ]; then
  printf '\n    platforms named in the page:\n'
  hit=0
  for f in "cnstrc:constructor(PnP!)" "algolia:algolia" \
           "searchspring:searchspring" "unbxd:unbxd" "bloomreach:bloomreach" \
           "graphql:graphql" "__NEXT_DATA__:next.js" "__NUXT__:nuxt" \
           "get-products-filter:shoprite-grp"; do
    if grep -qi "${f%%:*}" "$TMP/search.html"; then
      printf '      %s\n' "${f##*:}"; hit=1
    fi
  done
  [ "$hit" = 0 ] && printf '      none recognised\n'

  printf '\n    third-party hosts referenced:\n'
  grep -oE 'https?://[a-zA-Z0-9.-]+' "$TMP/search.html" \
    | sed 's|https\?://||' | grep -v 'woolworths' | cut -c1-32 | sort -u | head -12 \
    | sed 's/^/      /'
  printf '\n    api-ish paths in the page:\n'
  # Opening quote only, and no query string: "/api/x?q=milk" must still match,
  # and stopping at the ? keeps the line narrow.
  grep -oE "[\"']/[a-zA-Z0-9/_.-]*(api|search|product)[a-zA-Z0-9/_.-]*" "$TMP/search.html" \
    | tr -d "\"'" | cut -c1-32 | sort -u | head -6 | sed 's/^/      /'
else
  printf '%s\n' '    no search page answered'
  printf '%s\n' '    (need 200, >2KB, no WAF page)'
fi

# [5] Measure whatever JSON we got against the two parsers we already have.
printf '\n[5] which parser fits?\n'
if [ -f "$TMP/candidate.json" ]; then
  python3 - "$TMP/candidate.json" <<'PY'
import json, sys, textwrap

def wrap(names, indent="      "):
    if not names: return [indent + "(none)"]
    return textwrap.wrap(" ".join(names), 38 - len(indent),
                         initial_indent=indent, subsequent_indent=indent)

try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("    not JSON (%s)" % type(e).__name__); raise SystemExit

print("    top-level keys:")
for l in wrap(list(d)[:10]): print(l)

# Where shopriteGroup.normalise() and pnp.normalise() each look for the list.
cands = [("products", d.get("products")),
         ("data.products", (d.get("data") or {}).get("products")),
         ("results", d.get("results")),
         ("response.results", (d.get("response") or {}).get("results"))]
items = where = None
for name, v in cands:
    if isinstance(v, list) and v:
        items, where = v, name; break
if not items:
    print("    no product list found under")
    print("    products/data.products/results")
    print("    /response.results")
    print("    -> needs its own parser")
    raise SystemExit
print("    %d items, list at .%s" % (len(items), where))

p = items[0]
print("    1st product fields:")
for l in wrap(sorted(p)[:24]): print(l)

# Mirror what shopriteGroup.normalise() actually reads: image has two accepted
# names, and bonusBuy is optional (its absence means loyaltyPrice stays null).
img = [f for f in ("imageProductCardURL", "imageURL") if f in p]
req = [("id", "id" in p), ("name", "name" in p),
       ("image", bool(img)), ("price", "price" in p)]
print("    shoprite parser (normalise):")
for label, ok in req:
    print("      %-6s %s" % (label, "yes" if ok else "NO"))
bb = p.get("bonusBuy")
print("      %-6s %s" % ("loyal", "yes" if isinstance(bb, dict)
                         and "discountValue" in bb else "no (bonusBuy)"))
score = sum(1 for _, ok in req if ok)
print("      -> %d/4 required fields" % score)

pf = [("value", "value" in p), ("data", isinstance(p.get("data"), dict))]
pscore = sum(1 for _, ok in pf if ok)
print("    pnp parser: %d/2 required" % pscore)

if score == 4:
    print("    VERDICT reuses shopriteGroup")
elif pscore == 2:
    print("    VERDICT reuses pnp shape")
else:
    print("    VERDICT own parser needed")

# WRewards is Woolworths' loyalty programme; the loyalty price is the whole
# point of this app, so surface every key that could carry one.
money = [k for k in p if any(w in k.lower() for w in
         ("price", "promo", "reward", "loyal", "member", "sav", "discount"))]
print("    price/loyalty-ish keys:")
for l in wrap(sorted(money)): print(l)
PY
else
  printf '    no JSON captured yet\n'
  printf '    use [4] hosts/paths to pick the\n'
  printf '    real endpoint, then rerun with\n'
  printf '    that URL\n'
fi

printf '\n%s\n' '--------------------------------------'
printf 'credits spent: %s (cap %s)\n' "$(cat "$TMP/credits")" "$MAX_CREDITS"

cat <<'NOTE'

How to read this:

[3] JSON + [5] 6/6 shoprite fields
  -> a third ShopriteGroupSite, no new
     parser. (Unlikely: different co.)

[5] product list but different names
  -> own parser, same engine. Normal
     outcome. Paste [5] and I map the
     fields.

[4] names constructor/algolia/etc
  -> that platform's API is the real
     endpoint. Paste [4] and we probe
     it directly next round.

[2] WAF yes
  -> Woolworths needs ScraperAPI like
     Checkers, so it costs a credit
     per search. Worth knowing before
     any code is written.

Nothing here writes scraper code. The
shape decision is made from the output
above, not from what the site looks
like.
NOTE
