#!/usr/bin/env bash
# Woolworths runs Constructor.io — the same search platform Pick n Pay uses.
# probe-woolworths.sh found that (cnstrc.com in the page) and ruled out the
# Checkers/Shoprite endpoint. Three questions are left before a line of scraper
# code is worth writing:
#
#   1. what is Woolworths' OWN Constructor key, and does searching with it work
#   2. does pnp.ts normalise() actually fit the response, field for field
#   3. how is the Food department expressed — Woolworths also sells clothing,
#      beauty and homeware, and a clothing item in a grocery price comparison is
#      silently wrong rather than visibly broken
#
#   cd /opt/accucery && bash scripts/probe-woolworths-search.sh [query]
#
# Costs no ScraperAPI credits. Woolworths answered directly with no WAF, and
# Constructor.io is a public search endpoint, so nothing here goes through the
# residential proxy. Nothing here is on an automated path.
#
# Being on the same platform as Pick n Pay is NOT the same as having the same
# fields. That assumption is exactly what this measures rather than believes.
#
# Output stays under 40 columns, for reading on a phone.

set -uo pipefail

QUERY="${1:-milk}"
WW="https://www.woolworths.co.za"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

urlenc() { printf '%s' "$1" | sed 's|%|%25|g; s| |%20|g; s|&|%26|g; s|?|%3F|g'; }

# get <out> <url> -> "code|content_type|bytes". Pipe-separated: content_type
# carries "; charset=utf-8", which contains a space.
get() {
  local out="$1" url="$2" code ctype
  : > "$out"
  read -r code ctype <<<"$(curl -s -o "$out" -w '%{http_code} %{content_type}' -m 90 \
    -H "User-Agent: $UA" -H 'Accept-Language: en-ZA,en;q=0.9' \
    -H "Referer: $WW/" "$url" 2>/dev/null || echo '000 -')"
  printf '%s|%s|%s' "$code" "${ctype:--}" "$(wc -c < "$out" 2>/dev/null || echo 0)"
}

ct() {
  case "$1" in
    *json*) printf json ;; *html*) printf html ;;
    *javascript*) printf js ;; ""|-) printf - ;; *) printf other ;;
  esac
}

printf 'Accucery probe: WW search\n'
printf 'query: %-14s %s\n' "$QUERY" "$(date +%Y-%m-%d)"
printf '%s\n' '--------------------------------------'

# [1] The key is a public client key, served to every visitor. Pick n Pay's sits
# in its frontend bundle rather than its HTML, so look in both.
printf '\n[1] constructor key\n'
IFS='|' read -r code ctype bytes <<<"$(get "$TMP/page.html" "$WW/")"
printf '    page  %-4s %-5s %sB\n' "$code" "$(ct "$ctype")" "$bytes"

grep -ohE 'key_[A-Za-z0-9_-]{8,}' "$TMP/page.html" 2>/dev/null | sort -u > "$TMP/keys"
if [ -s "$TMP/keys" ]; then
  printf '    in html: yes\n'
else
  printf '    in html: no, trying bundles\n'
  grep -ohE 'src="[^"]+\.js[^"]*"' "$TMP/page.html" 2>/dev/null \
    | sed 's/^src="//; s/"$//' | sort -u | head -8 > "$TMP/scripts"
  i=0
  while IFS= read -r js; do
    [ -z "$js" ] && continue
    case "$js" in
      //*)   js="https:$js" ;;
      /*)    js="$WW$js"    ;;
      http*) ;;
      *)     js="$WW/$js"   ;;
    esac
    i=$((i+1))
    get "$TMP/js" "$js" >/dev/null
    grep -ohE 'key_[A-Za-z0-9_-]{8,}' "$TMP/js" 2>/dev/null >> "$TMP/keys.raw"
  done < "$TMP/scripts"
  printf '    bundles scanned: %s\n' "$i"
  sort -u "$TMP/keys.raw" 2>/dev/null > "$TMP/keys"
fi

printf '    keys found: %s\n' "$(wc -l < "$TMP/keys" | tr -d ' ')"
head -4 "$TMP/keys" | cut -c1-32 | sed 's/^/      /'

printf '    cnstrc refs in page:\n'
grep -ohE "[a-z0-9.-]*cnstrc\.com[^\"' )]*" "$TMP/page.html" 2>/dev/null \
  | cut -c1-32 | sort -u | head -4 | sed 's/^/      /' || printf '      (none)\n'

# [2] Ask Constructor with each candidate key until one answers with JSON.
printf '\n[2] search with that key\n'
HIT=""
KEY=""
while IFS= read -r k; do
  [ -z "$k" ] && continue
  IFS='|' read -r code ctype bytes <<<"$(get "$TMP/s.json" \
    "https://ac.cnstrc.com/search/$(urlenc "$QUERY")?key=${k}&num_results_per_page=20")"
  printf '    %-4s %-5s %sB %s\n' "$code" "$(ct "$ctype")" "$bytes" "$(printf '%s' "$k" | cut -c1-10)"
  if [ "$code" = "200" ] && printf '%s' "$ctype" | grep -qi json; then
    cp "$TMP/s.json" "$TMP/hit.json"; HIT=yes; KEY="$k"; break
  fi
done < "$TMP/keys"
[ -z "$HIT" ] && printf '    no key returned JSON\n'

# [3] onward: the shape, the price fields, and the department.
if [ -n "$HIT" ]; then
  python3 - "$TMP/hit.json" "$TMP/foodgid" "$TMP/ctlgid" <<'PY'
import json, re, sys, textwrap

def wrap(xs, ind="      "):
    xs = [str(x) for x in xs if x is not None]
    if not xs: return [ind + "(none)"]
    return textwrap.wrap(" ".join(xs), 38 - len(ind),
                         initial_indent=ind, subsequent_indent=ind)

d = json.load(open(sys.argv[1]))
r = d.get("response") or {}
res = r.get("results") or []
n = len(res)

print("\n[3] pnp parser fit")
print("    results: %d of %s" % (n, r.get("total_num_results", "?")))
if not res:
    print("    empty result set"); raise SystemExit

data = res[0].get("data") or {}
allkeys = set()
for x in res:
    allkeys |= set((x.get("data") or {}).keys())

checks = [("value", lambda x: "value" in x),
          ("data.id", lambda x: "id" in (x.get("data") or {})),
          ("image_url", lambda x: "image_url" in (x.get("data") or {})),
          ("priceValue", lambda x: "priceValue" in (x.get("data") or {}))]
score = 0
for label, pred in checks:
    c = sum(1 for x in res if pred(x))
    if c == n: score += 1
    print("      %-10s %d/%d" % (label, c, n))
print("      -> %d/4 on every result" % score)
print("      %s" % ("pnp normalise fits as is" if score == 4
                    else "identity yes, price no"))

print("\n[5] price fields")
# p10/p30/p60 with a _wp twin each. The bare ones differ from one another on the
# same product, so they are almost certainly price zones - which one Accucery
# should quote is a question for a human, not a default.
zk = sorted(k for k in allkeys if re.fullmatch(r"p\d+(_wp)?", k))
print("    zone keys:")
for l in wrap(zk): print(l)
base = [k for k in zk if not k.endswith("_wp")]
wps  = [k for k in zk if k.endswith("_wp")]

def num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0

disagree = sum(1 for x in res
               if len({str((x.get("data") or {}).get(k)) for k in base}) > 1)
haswp = [x for x in res
         if any(num((x.get("data") or {}).get(k)) for k in wps)]
print("    zones disagree: %d/%d" % (disagree, n))
print("    any _wp set:    %d/%d" % (len(haswp), n))

# A _wp that is ever non-zero is the loyalty price. Finding one product with it
# is what tells us the field, and nothing else in the response will.
if haswp:
    ex = haswp[0].get("data") or {}
    print("    example with _wp set:")
    print("      %s" % str(haswp[0].get("value", ""))[:32])
    for k in zk:
        print("      %-9s %s" % (k, ex.get(k)))
else:
    print("    no promo in these %d results;" % n)
    print("    rerun with a query likelier")
    print("    to be on promotion")

print("\n[6] department from the data")
# The product carries its own department, so this needs no filter at all.
for key in ("prodtype", "fulfiller", "dept"):
    counts = {}
    for x in res:
        v = str((x.get("data") or {}).get(key))
        counts[v] = counts.get(v, 0) + 1
    if list(counts) == ["None"]:
        continue
    print("    %s:" % key)
    for v, c in sorted(counts.items(), key=lambda kv: -kv[1])[:4]:
        print("      %-16s %d/%d" % (v[:16], c, n))

print("\n[7] group tree")
groups = r.get("groups") or []

def walk(gs, depth=0, out=None):
    if out is None: out = []
    for g in gs:
        out.append((depth, g.get("group_id"), g.get("display_name"), g.get("count")))
        walk(g.get("children") or [], depth + 1, out)
    return out

tree = walk(groups)
for depth, gid, name, cnt in tree[:10]:
    print("      %s%s (%s)" % ("  " * depth, str(name)[:14], cnt))

def is_food(name):
    return any(w in str(name).lower() for w in ("food", "grocer"))

food = next((t for t in tree if is_food(t[2])), None)
# A control group that is NOT food. If filtering by it also returns every
# result, the filter is being ignored; if it narrows, the filter works and
# "milk" simply happens to be all food. Identical counts alone cannot tell
# those apart, which is what the previous run got wrong.
ctl = next((t for t in tree if not is_food(t[2]) and t[1] and t[0] == (food[0] if food else 1)), None)
if food:
    open(sys.argv[2], "w").write(str(food[1] or ""))
    print("    food:    %s" % str(food[1])[:22])
if ctl:
    open(sys.argv[3], "w").write(str(ctl[1] or ""))
    print("    control: %s (%s)" % (str(ctl[1])[:14], str(ctl[2])[:10]))
else:
    print("    no non-food sibling to use")
    print("    as a control")
PY
fi

# [8] Two filtered searches, not one. The food filter alone proves nothing:
# an unchanged total is what you get both when the filter is ignored AND when
# every result was already food. The control group separates them.
if [ -n "$HIT" ] && [ -s "$TMP/foodgid" ]; then
  printf '\n[8] does the filter work?\n'
  ask_filtered() {
    IFS='|' read -r code ctype bytes <<<"$(get "$TMP/f.json" \
      "https://ac.cnstrc.com/search/$(urlenc "$QUERY")?key=${KEY}&num_results_per_page=1&filters%5Bgroup_id%5D=$1")"
    if [ "$code" = "200" ]; then
      python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("response") or {}).get("total_num_results","?"))' "$TMP/f.json"
    else
      printf 'HTTP %s' "$code"
    fi
  }
  ALL=$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("response") or {}).get("total_num_results","?"))' "$TMP/hit.json")
  FOODN=$(ask_filtered "$(cat "$TMP/foodgid")")
  printf '    unfiltered : %s\n' "$ALL"
  printf '    food group : %s\n' "$FOODN"
  if [ -s "$TMP/ctlgid" ]; then
    CTLN=$(ask_filtered "$(cat "$TMP/ctlgid")")
    printf '    control    : %s\n' "$CTLN"
    if [ "$CTLN" = "$ALL" ]; then
      printf '    control unchanged too ->\n'
      printf '    the filter is ignored\n'
    elif [ "$FOODN" = "$ALL" ]; then
      printf '    control narrowed but food\n'
      printf '    did not -> filter works and\n'
      printf '    every hit is already food\n'
    else
      printf '    both narrowed -> filter\n'
      printf '    works; food is %s of %s\n' "$FOODN" "$ALL"
    fi
  else
    printf '    no control group available\n'
  fi
fi


printf '\n%s\n' '--------------------------------------'
printf 'credits spent: 0 (no proxy used)\n'

cat <<'NOTE'

What decides it:

Step 5 names the price. p10/p30/p60
look like price zones, each with a
_wp twin that is the promotional
price. An example with _wp set is
the loyalty field; if none appears,
rerun with a query more likely to
be on promotion.

Step 6 says whether non-food is
already leaking into the results.

Step 8 needs its control line. The
food total alone proves nothing: an
unchanged count means either the
filter was ignored or every hit was
food already, and only a non-food
control tells those apart.

No lines here start with a bracket,
so slicing this output with sed or
awk cannot re-trigger on them.

No scraper code until all are read.
NOTE
