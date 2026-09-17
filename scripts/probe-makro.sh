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

# Walk everything. Guessing where products live is what cost two rounds on
# Woolworths, so this finds every list of objects and ranks them by size.
print("\n[3] product-shaped lists found")
found = []

def leaf_paths(obj, prefix="", depth=0, out=None):
    """Dotted paths to every scalar, a few levels down.

    Reporting only an item's top-level keys is useless when the fields are
    nested: Makro wraps each product in productInfo.value, so the parser needs
    productInfo.value.pricing.finalPrice.value, not "productInfo".
    """
    if out is None: out = set()
    if depth > 4: return out
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = "%s.%s" % (prefix, k) if prefix else k
            if isinstance(v, (dict, list)): leaf_paths(v, path, depth + 1, out)
            else: out.add(path)
    elif isinstance(obj, list):
        for x in obj[:2]:
            leaf_paths(x, prefix + "[]", depth + 1, out)
    return out

def walk(node, path):
    if isinstance(node, dict):
        for k, v in node.items():
            walk(v, "%s.%s" % (path, k))
    elif isinstance(node, list):
        objs = [x for x in node if isinstance(x, dict)]
        if len(objs) >= 3:
            fields = set()
            for x in objs[:10]: fields |= leaf_paths(x)
            found.append((len(objs), path, fields))
        for i, x in enumerate(node[:3]):
            walk(x, "%s[%d]" % (path, i))

for kind, blob in blobs:
    walk(blob, kind)

# The same array is often reachable by more than one route through the blob.
seen_sig = set()
unique = []
for n, path, fields in sorted(found, key=lambda t: -t[0]):
    sig = (n, frozenset(fields))
    if sig in seen_sig: continue
    seen_sig.add(sig); unique.append((n, path, fields))

if not unique:
    print("    none")
    raise SystemExit

def show(path, width=30):
    """One path per line, keeping the tail - the tail is the informative end."""
    return path if len(path) <= width else "~" + path[-(width - 1):]

def moneyish(path):
    """Match the last two segments only.

    Matching the whole path made every field look price-ish, because Makro
    nests everything under productInfo.value and "value" was in the word list.
    """
    tail = ".".join(path.split(".")[-2:]).lower()
    return any(w in tail for w in
               ("price", "mrp", "promo", "discount", "sav", "cost", "rrp"))

for n, path, fields in unique[:2]:
    print("    %d items at" % n)
    for l in wrap([path[-60:]]): print(l)
    print("      fields:")
    for f in sorted(fields)[:14]:
        print("        %s" % show(f))
    money = sorted(f for f in fields if moneyish(f))
    print("      price-ish:")
    if not money:
        print("        (none)")
    for f in money[:8]:
        print("        %s" % show(f))
    print("")
PY

printf '%s\n' '--------------------------------------'
printf 'credits spent: 0 (direct, no WAF)\n'

if [ -t 1 ]; then
cat <<'NOTE'

What decides it:

Step 3 lists every array of objects
in the page's embedded data, biggest
first, with the real key names. The
products are almost certainly the
largest one. Its price-ish keys are
the candidate price fields - but
Woolworths' price was p10/p30/p60
with no key containing "price", so
read the full key list, not only
that line.

No embedded JSON at all means the
products arrive by XHR after load,
and the next step is the network
endpoint rather than the page.
NOTE
fi
