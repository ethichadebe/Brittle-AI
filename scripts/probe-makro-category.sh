#!/usr/bin/env bash
# Does a Makro product node carry a field that separates food from non-food?
#
#   cd /opt/accucery && bash scripts/probe-makro-category.sh [query...]
#
# Searching Makro for "Eggs" returns plastic egg CONTAINERS at R123-R298 and no
# eggs. Woolworths had the same problem and it was solved with isFood() on
# `prodtype` - see backend/src/scraper/woolworths.ts. Whether Makro offers
# anything to filter on is unknown, and makro.ts has already shipped once
# reading a field that did not exist (node.imageUrl, empty on every product),
# so this answers the question before anything is written.
#
# It does NOT grep for a key called "category". Two reasons:
#
#   1. Key names are exactly what the last miss got wrong. The image turned out
#      to live under media.images[].url, which no name hint would have found.
#   2. A field named "category" is useless if every product in a grocery search
#      carries the same value, and a field named anything at all is useful if it
#      says "Home" for the egg containers and "Food" for the milk.
#
# So the test is SEPARATION, not naming: run several queries, keep every
# low-cardinality string field the product nodes carry, and report which of them
# take different values for a food query than for a non-food one. A field whose
# values are disjoint across those queries is a filter; a field with one value
# everywhere is not, whatever it is called.
#
# Default queries are chosen to force the question:
#   eggs   - the reported bug: returns containers, not food
#   milk   - unambiguously food
#   socks  - unambiguously not food (the Woolworths control)
#
# Costs no ScraperAPI credits: Makro is fetched directly.
# Output stays under 40 columns. Prints no secrets.

set -uo pipefail

MAKRO="https://www.makro.co.za"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
TMP="${PROBE_FIXTURE_DIR:-$(mktemp -d)}"
[ -n "${PROBE_FIXTURE_DIR:-}" ] || trap 'rm -rf "$TMP"' EXIT
command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

if [ "$#" -gt 0 ]; then QUERIES=("$@"); else QUERIES=(eggs milk socks); fi

# A fixture directory holds search-<query>.html, so the offline test drives the
# same code path the live run does.
if [ -n "${PROBE_FIXTURE_DIR:-}" ]; then
  echo "[1] fixtures"
  for q in "${QUERIES[@]}"; do
    F="$TMP/search-$q.html"
    [ -f "$F" ] || { echo "    missing: search-$q.html"; exit 1; }
    printf '    %s  %s bytes\n' "$q" "$(wc -c < "$F")"
  done
else
  urlenc() { printf '%s' "$1" | sed 's|%|%25|g; s| |%20|g; s|&|%26|g'; }
  echo "[1] fetch"
  for q in "${QUERIES[@]}"; do
    F="$TMP/search-$q.html"
    CODE=$(curl -sL --max-redirs 5 -o "$F" -w '%{http_code}' -m 90 \
      -H "User-Agent: $UA" -H 'Accept-Language: en-ZA,en;q=0.9' \
      -H "Referer: $MAKRO/" "$MAKRO/search?q=$(urlenc "$q")" 2>/dev/null || echo 000)
    printf '    %s  %s  %s bytes\n' \
      "$q" "$CODE" "$(wc -c < "$F" 2>/dev/null || echo 0)"
    [ "$CODE" = "200" ] || { echo "    not 200, stopping"; exit 1; }
  done
fi

python3 - "$TMP" "${QUERIES[@]}" <<'PY'
import json, os, re, sys
from collections import defaultdict

tmp, queries = sys.argv[1], sys.argv[2:]

# --- the same extraction makro.ts uses, so what this finds is what it sees ---
MARKERS = ["__INITIAL_STATE__", "__NEXT_DATA__", "pageDataV4"]
MAX_DEPTH = 40

def balanced(s, start):
    open_c = s[start]; close_c = "}" if open_c == "{" else "]"
    depth = 0; in_str = False; esc = False
    for i in range(start, len(s)):
        c = s[i]
        if in_str:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == '"': in_str = False
            continue
        if c == '"': in_str = True
        elif c == open_c: depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0: return s[start:i+1]
    return None

def blobs_of(html):
    out = []
    for marker in MARKERS:
        at = html.find(marker)
        while at != -1:
            brace = html.find("{", at + len(marker))
            if brace != -1 and brace - (at + len(marker)) < 40:
                raw = balanced(html, brace)
                if raw:
                    try: out.append(json.loads(raw))
                    except Exception: pass
            at = html.find(marker, at + len(marker))
    return out

def title_of(n):
    t = n.get("title")
    if isinstance(t, str) and t: return t
    nested = n.get("titles")
    if isinstance(nested, dict):
        t = nested.get("title")
        if isinstance(t, str): return t
    return ""

def products_of(blobs):
    found = {}
    def walk(node, depth=0):
        if depth > MAX_DEPTH or not isinstance(node, (dict, list)): return
        if isinstance(node, list):
            for c in node: walk(c, depth+1)
            return
        pid = node.get("productId") or node.get("itemId")
        if pid and title_of(node) and isinstance(node.get("pricing"), dict):
            found.setdefault(str(pid), node)
        for v in node.values(): walk(v, depth+1)
    for b in blobs: walk(b)
    return found

# A classification is a short string. Long text is a description, a URL is a
# link, and a number is a price or an id - none of them is a department.
URLISH = re.compile(r"^(https?:|/|www\.)", re.I)
def classifiable(v):
    return (isinstance(v, str) and 0 < len(v) <= 40
            and not URLISH.match(v) and not v.isdigit())

# path -> query -> set of values.  Lists are indexed positionally so a
# breadcrumb trail's levels stay distinguishable.
seen = defaultdict(lambda: defaultdict(set))
present = defaultdict(lambda: defaultdict(int))
counts = {}

def scan(node, q, path="", depth=0):
    if depth > MAX_DEPTH: return
    if isinstance(node, dict):
        for k, v in node.items():
            scan(v, q, "%s.%s" % (path, k) if path else k, depth+1)
    elif isinstance(node, list):
        for i, v in enumerate(node[:3]):
            scan(v, q, "%s[%d]" % (path, i), depth+1)
    elif classifiable(node) and path:
        seen[path][q].add(node)
        present[path][q] += 1

print("[2] products per query")
for q in queries:
    f = os.path.join(tmp, "search-%s.html" % q)
    html = open(f, encoding="utf-8", errors="replace").read()
    prods = products_of(blobs_of(html))
    counts[q] = len(prods)
    print("    %-10s %d" % (q[:10], len(prods)))
    for node in prods.values():
        scan(node, q)

live = [q for q in queries if counts.get(q)]
if len(live) < 2:
    print("[3] need 2+ queries with")
    print("    products; stopping")
    sys.exit(0)

# Grouping is what separates a department from a name, and it cannot be shown
# on one or two products - so say that rather than report a confident zero.
thin = [q for q in live if counts[q] < 3]
if thin:
    print("    thin: %s" % ", ".join(q[:8] for q in thin[:3]))
    print("    <3 products, grouping")
    print("    cannot be demonstrated")

# A usable filter must be on most products of every query. A field carried by a
# handful is a badge ("Bestseller"), not a department.
def coverage(path):
    return min(present[path][q] / counts[q] for q in live)

# Separation: the values for one query are disjoint from another's. That is
# what prodtype did for Woolworths - Food vs Clothing, never both.
def separates(path):
    sets = [seen[path][q] for q in live]
    if any(not s for s in sets): return False
    return all(sets[i].isdisjoint(sets[j])
               for i in range(len(sets)) for j in range(i+1, len(sets)))

# One value everywhere is the opposite: present, stable, and useless.
def constant(path):
    union = set()
    for q in live: union |= seen[path][q]
    return len(union) == 1

# A classification GROUPS products; an identifier does not. A title is distinct
# on every product, so it is trivially "disjoint" between any two queries and
# would top the list while meaning nothing - the same mistake as ranking arrays
# by size, an incidental property standing in for relevance. Requiring at least
# one query where the field takes fewer values than there are products is what
# tells a department from a name.
def groups(path):
    return any(0 < len(seen[path][q]) < counts[q] for q in live)

cands = [p for p in seen
         if coverage(p) >= 0.5 and not constant(p) and groups(p)
         and len(set().union(*(seen[p][q] for q in live))) <= 12]

def wrap(text, indent, width=34):
    for i in range(0, len(text), width):
        print("%s%s" % (indent, text[i:i+width]))

sep = sorted((p for p in cands if separates(p)), key=lambda p: -coverage(p))
print("[3] separating fields: %d" % len(sep))
if not sep:
    print("    NONE - no field tells")
    print("    these queries apart")
for p in sep[:6]:
    print("  %d%% of products" % round(coverage(p) * 100))
    wrap(p, "    ")
    for q in live:
        vals = ", ".join(sorted(seen[p][q]))
        wrap("%s: %s" % (q[:8], vals[:80]), "      ", 32)

near = [p for p in cands if p not in sep]
print("[4] varying, not disjoint: %d" % len(near))
for p in sorted(near, key=lambda p: -coverage(p))[:4]:
    print("  %d%%" % round(coverage(p) * 100))
    wrap(p, "    ")
    for q in live:
        vals = ", ".join(sorted(seen[p][q]))
        wrap("%s: %s" % (q[:8], vals[:60]), "      ", 32)

print("[5] verdict")
if sep:
    print("    a filter exists; use the")
    print("    top path above")
else:
    print("    no category field here.")
    print("    a Makro food filter would")
    print("    need another source")
PY
