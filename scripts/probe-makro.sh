#!/usr/bin/env bash
# Where does Makro's search page keep its products?
#
#   cd /opt/accucery && bash scripts/probe-makro.sh [query]
#
# probe-store.sh established the ground: makro.co.za answers directly with no
# WAF and costs no ScraperAPI credits, it is not the Checkers platform, and its
# page references flipkart.com and flixcart.com. Makro runs Flipkart's commerce
# stack - Walmart owns both Flipkart and, through Massmart, Makro.
#
# This asks the two questions that decide the parser:
#
#   1. does the search page carry its products as embedded JSON
#   2. if so, what are the field names - found by walking the structure, NOT by
#      guessing key names
#
# That second point is the whole design. Woolworths' price lived in p10/p30/p60
# and no key contained the word "price", so two rounds of keyword guessing found
# nothing. This walks every list of objects in the document and reports the
# biggest ones with their real keys.
#
# Costs no credits: Makro is fetched directly.
# Output stays under 40 columns, and the notes print only to a terminal.

set -uo pipefail

QUERY="${1:-milk}"
MAKRO="https://www.makro.co.za"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

urlenc() { printf '%s' "$1" | sed 's|%|%25|g; s| |%20|g; s|&|%26|g'; }

get() {  # get <out> <url> -> "code|content_type|bytes"
  local out="$1" url="$2" code ctype
  : > "$out"
  IFS='|' read -r code ctype <<<"$(curl -sL --max-redirs 5 -o "$out" \
    -w '%{http_code}|%{content_type}' -m 90 \
    -H "User-Agent: $UA" -H 'Accept-Language: en-ZA,en;q=0.9' \
    -H "Referer: $MAKRO/" "$url" 2>/dev/null || echo '000|-')"
  printf '%s|%s|%s' "$code" "${ctype:--}" "$(wc -c < "$out" 2>/dev/null || echo 0)"
}

post() {  # post <out> <url> <body> -> "code|content_type|bytes"
  local out="$1" url="$2" body="$3" code ctype
  : > "$out"
  IFS='|' read -r code ctype <<<"$(curl -sL --max-redirs 5 -o "$out" \
    -w '%{http_code}|%{content_type}' -m 90 -X POST \
    -H "User-Agent: $UA" -H 'Content-Type: application/json' \
    -H 'Accept: */*' -H "Origin: $MAKRO" -H "Referer: $MAKRO/search" \
    --data "$body" "$url" 2>/dev/null || echo '000|-')"
  printf '%s|%s|%s' "$code" "${ctype:--}" "$(wc -c < "$out" 2>/dev/null || echo 0)"
}

ct() {
  case "$1" in
    *json*) printf json ;; *html*) printf html ;;
    ""|-) printf - ;; *) printf other ;;
  esac
}

printf 'Accucery probe: Makro\n'
printf 'query: %-14s %s\n' "$QUERY" "$(date +%Y-%m-%d)"
printf '%s\n' '--------------------------------------'

# [1] Two candidate pages. /search answered 200 with 1.19MB in probe-store.sh,
# and /food-products/milk/pr is the category path its own HTML referenced.
printf '\n[1] pages\n'
BEST=""
for path in "/search?q=$(urlenc "$QUERY")" "/food-products/$(urlenc "$QUERY")/pr"; do
  IFS='|' read -r code ctype bytes <<<"$(get "$TMP/p.html" "$MAKRO$path")"
  printf '    %-4s %-5s %-9sB\n' "$code" "$(ct "$ctype")" "$bytes"
  printf '      %s\n' "$(printf '%s' "${path%%\?*}" | cut -c1-32)"
  if [ "$code" = "200" ] && [ "${bytes:-0}" -gt 20000 ]; then
    cp "$TMP/p.html" "$TMP/best.html"; BEST="$path"
    [ "${BEST#/search}" != "$BEST" ] && break
  fi
done
[ -z "$BEST" ] && { printf '    no page answered\n'; exit 1; }

# [2] and [3]: markers, then the structure itself.
python3 - "$TMP/best.html" <<'PY'
import json, re, sys, textwrap

html = open(sys.argv[1], encoding="utf-8", errors="replace").read()

def wrap(xs, ind="      "):
    xs = [str(x) for x in xs if x is not None]
    if not xs: return [ind + "(none)"]
    return textwrap.wrap(" ".join(xs), 38 - len(ind),
                         initial_indent=ind, subsequent_indent=ind)

print("\n[2] embedded data markers")
markers = ["__INITIAL_STATE__", "__NEXT_DATA__", "__PRELOADED_STATE__",
           "__NUXT__", "application/ld+json", "window.__", "pageDataV4",
           "flixcart", "flipkart"]
seen = [m for m in markers if m in html]
for l in wrap(seen): print(l)

def balanced(s, start):
    """Slice the JSON object or array beginning at start, respecting strings."""
    open_c = s[start]
    close_c = "}" if open_c == "{" else "]"
    depth, i, in_str, esc = 0, start, False, False
    while i < len(s):
        c = s[i]
        if in_str:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == '"': in_str = False
        elif c == '"': in_str = True
        elif c == open_c: depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0: return s[start:i + 1]
        i += 1
    return None

blobs = []
for m in re.finditer(r'(?:__INITIAL_STATE__|__NEXT_DATA__|__PRELOADED_STATE__|pageDataV4)'
                     r'\s*=?\s*', html):
    j = html.find("{", m.end())
    if j != -1 and j - m.end() < 40:
        raw = balanced(html, j)
        if raw:
            try: blobs.append(("script", json.loads(raw)))
            except Exception: pass
for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>',
                     html, re.S):
    try: blobs.append(("ld+json", json.loads(m.group(1).strip())))
    except Exception: pass

print("    parsed blobs: %d" % len(blobs))
if not blobs:
    print("    no embedded JSON parsed;")
    print("    products are rendered into")
    print("    the HTML or fetched by XHR")
    raise SystemExit

# Walk everything. Ranking by SIZE was wrong: on Makro the two biggest arrays
# are the router config (47) and a facet's filter values (34), while the results
# are somewhere smaller. Rank by how much an array LOOKS like products instead.
print("\n[3] product-shaped lists found")

arrays = []
price_paths = set()

def moneyish(path):
    """Match the last two segments only.

    Matching the whole path made every field look price-ish, because Makro
    nests everything under productInfo.value and "value" was in the word list.
    """
    tail = ".".join(path.split(".")[-2:]).lower()
    return any(w in tail for w in
               ("price", "mrp", "promo", "discount", "saving", "cost", "rrp"))

def leaf_paths(obj, prefix="", depth=0, out=None):
    """Dotted paths to every scalar, a few levels down.

    Top-level keys are useless when fields are nested: a Flipkart product's
    wrapper has one key, productInfo, while the parser needs
    productInfo.value.pricing.finalPrice.value.
    """
    if out is None: out = set()
    if depth > 4 or len(out) > 400: return out
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = "%s.%s" % (prefix, k) if prefix else k
            if isinstance(v, (dict, list)): leaf_paths(v, path, depth + 1, out)
            else: out.add(path)
    elif isinstance(obj, list):
        for x in obj[:2]:
            leaf_paths(x, prefix + "[]", depth + 1, out)
    return out

def walk(node, path, depth=0):
    if depth > 12: return
    if isinstance(node, dict):
        for k, v in node.items():
            p = "%s.%s" % (path, k)
            if isinstance(v, (dict, list)): walk(v, p, depth + 1)
            elif isinstance(v, (int, float)) and moneyish(p):
                # Collapse array indices so one logical field is one entry:
                # walking three elements of the same array otherwise reports the
                # same price field three times.
                price_paths.add(re.sub(r"\[\d+\]", "[]", p))
    elif isinstance(node, list):
        objs = [x for x in node if isinstance(x, dict)]
        if len(objs) >= 3:
            fields = set()
            for x in objs[:10]: leaf_paths(x, out=fields)
            arrays.append((len(objs), path, fields))
        for i, x in enumerate(node[:3]):
            walk(x, "%s[%d]" % (path, i), depth + 1)

def last(path):
    return path.split(".")[-1].lower()

def score(fields):
    """How much does this array look like a product list?"""
    s = 0
    if any(moneyish(f) for f in fields): s += 3
    if any(re.search(r"(title|name)$", last(f)) for f in fields): s += 2
    if any(re.search(r"(image|img|thumb|url)", last(f)) for f in fields): s += 1
    if any(re.search(r"(^id$|pid|sku|productid)", last(f)) for f in fields): s += 1
    return s

for kind, blob in blobs:
    walk(blob, kind)

seen_sig, ranked = set(), []
for n, path, fields in arrays:
    sig = (n, frozenset(fields))
    if sig in seen_sig: continue
    seen_sig.add(sig)
    ranked.append((score(fields), n, path, fields))
ranked.sort(key=lambda t: (-t[0], -t[1]))

def show(path, width=30):
    """One path per line, keeping the tail - the tail is the informative end."""
    return path if len(path) <= width else "~" + path[-(width - 1):]

if not ranked:
    print("    none")
else:
    for sc, n, path, fields in ranked[:3]:
        print("    score %d - %d items at" % (sc, n))
        for l in wrap([path[-60:]]): print(l)
        print("      fields:")
        for f in sorted(fields)[:12]:
            print("        %s" % show(f))
        money = sorted(f for f in fields if moneyish(f))
        print("      price-ish:")
        if not money: print("        (none)")
        for f in money[:6]:
            print("        %s" % show(f))
        print("")
    if ranked[0][0] < 3:
        print("    nothing scores on price:")
        print("    no array here looks like a")
        print("    product list")

# Decisive either way: if no numeric price field exists anywhere in the embedded
# data, the products are not in this page and the next step is the XHR endpoint.
# The same field is reachable through more than one blob root, because
# __INITIAL_STATE__ and pageDataV4 match overlapping objects. Collapse to the
# last few segments, which is the part that identifies the field anyway.
tails = sorted({".".join(f.split(".")[-4:]) for f in price_paths})
print("[4] how many products in the page")
ids = {}
def collect_ids(node, depth=0):
    if depth > 40: return
    if isinstance(node, dict):
        for k, v in node.items():
            kl = k.lower()
            if kl in ("productid", "itemid", "pid") and isinstance(v, str) and len(v) > 4:
                ids.setdefault(kl, set()).add(v)
            elif isinstance(v, (dict, list)):
                collect_ids(v, depth + 1)
    elif isinstance(node, list):
        for x in node:
            collect_ids(x, depth + 1)

for _kind, _blob in blobs:
    collect_ids(_blob)
if not ids:
    print("    no product ids found")
else:
    for k in sorted(ids):
        print("      %-10s %d distinct" % (k, len(ids[k])))
    most = max(len(v) for v in ids.values())
    if most < 15:
        print("    fewer than a full page of")
        print("    results: the rest arrive by")
        print("    XHR, so a scraper needs")
        print("    pagination or the API")
    else:
        print("    a full page: one request is")
        print("    likely enough")

print("\n[5] price fields anywhere")
print("    %d distinct" % len(tails))
for f in tails[:8]:
    print("      %s" % show(f, 32))
if not tails:
    print("    none - prices are not in the")
    print("    page, so results arrive by")
    print("    XHR. Probe that endpoint next.")

NOISE = ("action.", "tracking.", "omniture", "analytics", "wishlist",
         "constraints", "loginType", "permission", "redirect",
         # Reviews are attached to each product and are bulkier than it is:
         # mostHelpful and mostRecent buried the title and price on the live run.
         "mosthelpful", "mostrecent", "review", "rating")

def is_noise(path):
    low = path.lower()
    return any(n in low for n in NOISE)

# [5] The parser needs values, not just paths. Print the best array's first item
# with its actual contents, analytics stripped out.
print("\n[6] first product, values")
if not ranked or ranked[0][0] < 3:
    print("    no product-shaped array")
else:
    _, _, best_path, _ = ranked[0]
    target = None
    for kind, blob in blobs:
        node = blob
        try:
            for part in re.findall(r"\.([^.\[]+)|\[(\d+)\]", best_path):
                key, idx = part
                node = node[key] if key else node[int(idx)]
        except Exception:
            continue
        if isinstance(node, list) and node:
            target = node[0]; break
    if target is None:
        print("    could not re-read it")
    else:
        pairs = []

        def collect(obj, prefix="", depth=0):
            if depth > 5 or len(pairs) > 200: return
            if isinstance(obj, dict):
                for k, v in obj.items():
                    path = "%s.%s" % (prefix, k) if prefix else k
                    if is_noise(path): continue
                    if isinstance(v, (dict, list)): collect(v, path, depth + 1)
                    elif v not in (None, "", [], {}): pairs.append((path, v))
            elif isinstance(obj, list):
                for i, x in enumerate(obj[:2]):
                    collect(x, "%s[%d]" % (prefix, i), depth + 1)

        collect(target)
        if not pairs:
            print("    nothing but analytics")

        def interest(pair):
            """What a parser needs, first.

            Insertion order put a reviews widget's fields ahead of the title and
            price on the live page. Sorting by relevance is what makes the
            output answer the question it was written to ask.
            """
            path, _ = pair
            leaf = path.split(".")[-1].lower()
            if moneyish(path): return 0
            if re.search(r"(title|name)$", leaf): return 1
            if re.search(r"(image|img|thumb|url)", leaf): return 2
            if re.search(r"(^id$|pid|sku|itemid|productid)", leaf): return 3
            return 4

        # Ranking alone is not enough. Makro carries sixteen-plus price fields,
        # so sorting by relevance filled every slot with prices and hid the
        # title and image again - the third time this output has buried the
        # answer. Take a few from each category instead.
        CAPS = {0: 7, 1: 4, 2: 3, 3: 3, 4: 4}
        def numeric_first(pair):
            """A price is a number.

            priceType: "DELIVERY_CHARGE" and listingPriceType: "REGULAR" are
            labels, and they filled the price bucket ahead of mrp.value and
            prices[].value - the only fields a parser can actually read.
            """
            _, val = pair
            return 0 if isinstance(val, (int, float)) and not isinstance(val, bool) else 1

        buckets = {}
        for pair in pairs:
            buckets.setdefault(interest(pair), []).append(pair)
        shown = []
        for cat in sorted(buckets):
            ordered = sorted(buckets[cat], key=numeric_first)
            shown.extend(ordered[:CAPS.get(cat, 3)])
        for path, val in shown[:21]:
            tail = ".".join(path.split(".")[-2:])[:17]
            text = str(val)[:14]
            print("      %-17s %s" % (tail, text))
        print("    (%d fields, analytics hidden)" % len(pairs))
PY

printf '%s\n' '--------------------------------------'
printf 'credits spent: 0 (direct, no WAF)\n'

# [7] Simulate the parser. The page turned out to hold forty products spread
# across many widgets, not the five the top two arrays suggested, so the question
# is no longer "where are the rest" but "does a recursive extraction find usable
# ones". Usable means an id, a title and a price - anything less cannot become a
# Product.
printf '\n[7] parser simulation\n'
python3 - "$TMP/best.html" <<'PY'
import json, re, sys

html = open(sys.argv[1], encoding="utf-8", errors="replace").read()

def balanced(s, start):
    open_c = s[start]; close_c = "}" if open_c == "{" else "]"
    depth, i, in_str, esc = 0, start, False, False
    while i < len(s):
        c = s[i]
        if in_str:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == '"': in_str = False
        elif c == '"': in_str = True
        elif c == open_c: depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0: return s[start:i + 1]
        i += 1
    return None

blobs = []
for m in re.finditer(r"(?:__INITIAL_STATE__|__NEXT_DATA__|pageDataV4)\s*=?\s*", html):
    j = html.find("{", m.end())
    if j != -1 and j - m.end() < 40:
        raw = balanced(html, j)
        if raw:
            try: blobs.append(json.loads(raw))
            except Exception: pass

# Flipkart spreads products across widgets, so find them by SHAPE rather than by
# following one path. A product object carries a title, a pricing block and an id.
found = {}

def price_of(pricing, want):
    for p in pricing.get("prices") or []:
        if isinstance(p, dict) and p.get("priceType") == want:
            v = p.get("value")
            if isinstance(v, (int, float)): return float(v)
    return None

def title_of(node):
    """Two widget shapes carry the title differently.

    renderableComponents puts it at value.title; the products widget nests it
    at titles.title. Accepting only the first found five products and would
    have reported the rest as absent.
    """
    direct = node.get("title")
    if isinstance(direct, str) and direct: return direct
    titles = node.get("titles")
    if isinstance(titles, dict):
        nested = titles.get("title")
        if isinstance(nested, str) and nested: return nested
    return None

def visit(node, depth=0):
    # Deep enough to reach every widget. Flipkart nests hard, and a shallow
    # limit proves nothing about what is or is not in the page.
    if depth > 40: return
    if isinstance(node, dict):
        pricing = node.get("pricing")
        pid = node.get("productId") or node.get("itemId")
        title = title_of(node)
        if isinstance(pricing, dict) and isinstance(pid, str) and title:
            regular = price_of(pricing, "FSP")
            if regular is None:
                mrp = pricing.get("mrp")
                if isinstance(mrp, dict) and isinstance(mrp.get("value"), (int, float)):
                    regular = float(mrp["value"])
            special = price_of(pricing, "SPECIAL_PRICE")
            if regular is not None:
                found[pid] = (title, regular, special)
        for v in node.values():
            if isinstance(v, (dict, list)): visit(v, depth + 1)
    elif isinstance(node, list):
        for x in node: visit(x, depth + 1)

for b in blobs: visit(b)

print("    usable products: %d" % len(found))
if not found:
    print("    none carried id+title+price")
else:
    with_promo = sum(1 for _t, _r, sp in found.values() if sp is not None)
    print("    with a special price: %d" % with_promo)
    for title, regular, special in list(found.values())[:3]:
        print("      %s" % title[:30])
        if special is not None:
            print("        R%s was R%s" % (special, regular))
        else:
            print("        R%s" % regular)
PY

if [ -t 1 ]; then
cat <<'NOTE'

What decides it:

Step 3 ranks arrays by how much they
look like products - a price field
scores most, then a title, an image,
an id. Size was the old ranking and
it was wrong: Makro's two biggest
arrays are router config and facet
values.

Step 4 counts the products in the
page. Forty is a full page, so no
XHR endpoint is needed - the earlier
reading of five came from looking at
only the two top-scoring arrays.

Step 7 is what the scraper will do:
walk the page finding objects that
carry an id, a title and a price.
Its count should be close to step
4's, and its sample prices should
match the site.
NOTE
fi
