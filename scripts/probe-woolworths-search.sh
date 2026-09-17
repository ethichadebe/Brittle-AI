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

# [3] and [4] together: the shape, and the department.
if [ -n "$HIT" ]; then
  python3 - "$TMP/hit.json" "$TMP/foodgid" <<'PY'
import json, sys, textwrap

def wrap(xs, ind="      "):
    xs = [str(x) for x in xs if x is not None]
    if not xs: return [ind + "(none)"]
    return textwrap.wrap(" ".join(xs), 38 - len(ind),
                         initial_indent=ind, subsequent_indent=ind)

d = json.load(open(sys.argv[1]))
r = d.get("response") or {}
res = r.get("results") or []

print("\n[3] pnp parser fit")
print("    results: %d of %s" % (len(res), r.get("total_num_results", "?")))
if not res:
    print("    empty result set"); raise SystemExit

data = res[0].get("data") or {}
# Every field is counted across all results, never just the first. A loyalty
# price exists only on promotion items, so reading result zero alone would hide
# the one field this app exists to find.
allkeys = set()
for x in res:
    allkeys |= set((x.get("data") or {}).keys())

n = len(res)
# Exactly what pnp.ts normalise() reads, per item.
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
                    else "needs its own parser"))

# Pick n Pay's loyalty branch keys off these two values. Woolworths' programme
# is WRewards, so the values almost certainly differ even on the same platform.
def vals(key):
    return sorted({str((x.get("data") or {}).get(key)) for x in res} - {"None"})
print("    priceConditionType seen:")
for l in wrap(vals("priceConditionType")): print(l)
print("    promotionDisplayType seen:")
for l in wrap(vals("promotionDisplayType")): print(l)
hits = sum(1 for x in res
           if (x.get("data") or {}).get("promotionDisplayType") == "SMART_SHOPPER")
print("    pnp loyalty rule hits: %d/%d" % (hits, len(res)))
money = [k for k in allkeys if any(w in k.lower() for w in
         ("price", "promo", "reward", "loyal", "member", "sav", "discount"))]
print("    price/loyalty-ish keys:")
for l in wrap(sorted(money)): print(l)

print("\n[4] Food department")
facets = r.get("facets") or []
print("    facets: %d" % len(facets))
for l in wrap([f.get("display_name") or f.get("name") for f in facets][:8]): print(l)

groups = r.get("groups") or []
print("    top groups: %d" % len(groups))
for g in groups[:6]:
    print("      %-20s %s" % (str(g.get("display_name"))[:20], g.get("count", "")))

def find_food(gs):
    for g in gs:
        if any(w in str(g.get("display_name", "")).lower()
               for w in ("food", "grocer")):
            return g
        got = find_food(g.get("children") or [])
        if got: return got
    return None

food = find_food(groups)
if food:
    print("    Food group id:")
    for l in wrap([food.get("group_id")]): print(l)
    gid = food.get("group_id")
    inside = sum(1 for x in res
                 if gid in ((x.get("data") or {}).get("group_ids") or []))
    print("    results in Food: %d/%d" % (inside, len(res)))
    open(sys.argv[2], "w").write(str(food.get("group_id") or ""))
    if inside == 0:
        print("    none carry it: results use")
        print("    leaf category ids, so this")
        print("    is ancestry not membership")
        print("    -> [6] asks the server")
else:
    print("    no Food group in response")
    print("    -> department is not a group;")
    print("       next probe asks about a")
    print("       path or filter instead")

# Whether a non-food result can even be told apart is the whole question here.
print("    group_ids on 1st result:")
for l in wrap((data.get("group_ids") or [])[:4]): print(l)

# Round 2 filtered keys by guessed words like "price" and found none, which is
# the point: the price is under a name nobody guessed. So show every key.
print("\n[5] where is the price?")
print("    all data keys (%d):" % len(allkeys))
for l in wrap(sorted(allkeys)): print(l)
print("    1st result values:")
shown = 0
for k in sorted(data):
    v = data[k]
    if isinstance(v, bool) or not isinstance(v, (str, int, float)):
        continue
    t = str(v)
    if len(t) > 40:          # descriptions, not prices
        continue
    if len(t) > 14:
        t = t[:14] + "~"
    print("      %-16s %s" % (k[:16], t))
    shown += 1
    if shown >= 18:
        break
vs = res[0].get("variations") or []
print("    variations: %d" % len(vs))
if vs:
    vd = (vs[0].get("data") or {})
    print("    variation data keys:")
    for l in wrap(sorted(vd)): print(l)
PY
fi

# [6] Results carry leaf categories, so a membership test cannot answer the
# department question. Ask Constructor to filter instead, and see whether the
# server understands it. Narrowing is the evidence; an unchanged total means the
# filter was ignored and Food is expressed some other way.
if [ -n "$HIT" ] && [ -s "$TMP/foodgid" ]; then
  GID="$(cat "$TMP/foodgid")"
  printf '\n[6] ask server for Food only\n'
  printf '    group_id: %s\n' "$(printf '%s' "$GID" | cut -c1-22)"
  IFS='|' read -r code ctype bytes <<<"$(get "$TMP/food.json" \
    "https://ac.cnstrc.com/search/$(urlenc "$QUERY")?key=${KEY}&num_results_per_page=20&filters%5Bgroup_id%5D=${GID}")"
  printf '    %-4s %-5s %sB\n' "$code" "$(ct "$ctype")" "$bytes"
  python3 - "$TMP/hit.json" "$TMP/food.json" <<'PY'
import json, sys

def load(f):
    r = json.load(open(f)).get("response") or {}
    return r.get("total_num_results"), (r.get("results") or [])

all_n, all_r = load(sys.argv[1])
food_n, food_r = load(sys.argv[2])
print("    all:  %s results" % all_n)
print("    food: %s results" % food_n)
if food_n is None:
    print("    filter not understood")
elif food_n == all_n:
    print("    identical -> filter ignored;")
    print("    Food is not a group_id")
else:
    print("    narrowed -> server filters it")
    top_a = [(x.get("data") or {}).get("id") for x in all_r[:5]]
    top_b = [(x.get("data") or {}).get("id") for x in food_r[:5]]
    print("    same top 5: %s" % ("yes" if top_a == top_b else "no"))
    if food_r:
        print("    1st food result:")
        print("      %s" % str(food_r[0].get("value", ""))[:32])
PY
fi

printf '\n%s\n' '--------------------------------------'
printf 'credits spent: 0 (no proxy used)\n'

cat <<'NOTE'

What decides it:

Step 5 names the price field. pnp.ts
reads data.priceValue, which came
back 0/20 here, so the fetch may be
shared while the price mapping is
Woolworths' own.

Step 6 decides Food. "narrowed"
means the scraper passes
filters[group_id] and the server
does the work. "identical" means the
filter was ignored and Food is
expressed some other way.

No lines here start with a bracket,
so slicing this output with sed or
awk cannot re-trigger on them.

No scraper code until both are read.
NOTE
