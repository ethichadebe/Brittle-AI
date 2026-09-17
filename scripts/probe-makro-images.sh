#!/usr/bin/env bash
# Where does a Makro product keep its image?
#
#   cd /opt/accucery && bash scripts/probe-makro-images.sh [query]
#
# makro.ts reads node.imageUrl and a live search returned it EMPTY for every
# product, so the field is not there. The scraper shipped with images broken
# because the test fixtures were hand-written with a plausible-looking
# makro.co.za/x.jpg rather than a real URL - the probe had never printed one.
#
# So this does not guess key names. It finds product-shaped nodes exactly the
# way makro.ts does - an id, a title and a pricing block - then walks each one
# for strings that look like images, and reports the PATHS and the HOSTS.
#
# The host matters as much as the path: backend/src/routes/imageProxy.ts serves
# only an allowlist, and Woolworths shipped with every image 400ing because its
# assets live on a different domain from its site.
#
# Costs no ScraperAPI credits: Makro is fetched directly.
# Output stays under 40 columns. Prints no secrets.

set -uo pipefail

QUERY="${1:-eggs}"
MAKRO="https://www.makro.co.za"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
TMP="${PROBE_FIXTURE_DIR:-$(mktemp -d)}"
[ -n "${PROBE_FIXTURE_DIR:-}" ] || trap 'rm -rf "$TMP"' EXIT
command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

PAGE="$TMP/search.html"

if [ -n "${PROBE_FIXTURE_DIR:-}" ]; then
  echo "[1] fixture: $(wc -c < "$PAGE") bytes"
else
  urlenc() { printf '%s' "$1" | sed 's|%|%25|g; s| |%20|g; s|&|%26|g'; }
  URL="$MAKRO/search?q=$(urlenc "$QUERY")"
  CODE=$(curl -sL --max-redirs 5 -o "$PAGE" -w '%{http_code}' -m 90 \
    -H "User-Agent: $UA" -H 'Accept-Language: en-ZA,en;q=0.9' \
    -H "Referer: $MAKRO/" "$URL" 2>/dev/null || echo 000)
  printf '[1] search?q=%s\n    %s  %s bytes\n' \
    "$QUERY" "$CODE" "$(wc -c < "$PAGE" 2>/dev/null || echo 0)"
  [ "$CODE" = "200" ] || { echo "    not 200, stopping"; exit 1; }
fi

python3 - "$PAGE" <<'PY'
import json, re, sys
from collections import Counter, defaultdict
from urllib.parse import urlparse

html = open(sys.argv[1], encoding="utf-8", errors="replace").read()

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

blobs = []
for marker in MARKERS:
    at = html.find(marker)
    while at != -1:
        brace = html.find("{", at + len(marker))
        if brace != -1 and brace - (at + len(marker)) < 40:
            raw = balanced(html, brace)
            if raw:
                try: blobs.append(json.loads(raw))
                except Exception: pass
        at = html.find(marker, at + len(marker))
print("[2] state blobs: %d" % len(blobs))

def title_of(n):
    t = n.get("title")
    if isinstance(t, str) and t: return t
    nested = n.get("titles")
    if isinstance(nested, dict):
        t = nested.get("title")
        if isinstance(t, str): return t
    return ""

products = {}
def find_products(node, depth=0):
    if depth > MAX_DEPTH or not isinstance(node, (dict, list)): return
    if isinstance(node, list):
        for c in node: find_products(c, depth+1)
        return
    pid = node.get("productId") or node.get("itemId")
    if pid and title_of(node) and isinstance(node.get("pricing"), dict):
        products.setdefault(str(pid), node)
    for v in node.values(): find_products(v, depth+1)

for b in blobs: find_products(b)
print("[3] product-shaped: %d" % len(products))
if not products:
    print("    nothing to inspect"); sys.exit(0)

# --- now: which strings inside a product look like an image? ---
IMG_EXT = re.compile(r"\.(?:jpe?g|png|webp|avif|gif)\b", re.I)
NAME_HINT = re.compile(r"image|img|media|thumb|photo|picture", re.I)

paths = Counter()          # dotted path -> how many products carry it
samples = {}               # dotted path -> one raw value
evidence = {}              # dotted path -> why it was flagged
hosts = Counter()

def scan(node, prod, path="", depth=0):
    if depth > MAX_DEPTH: return
    if isinstance(node, dict):
        for k, v in node.items():
            scan(v, prod, "%s.%s" % (path, k) if path else k, depth+1)
    elif isinstance(node, list):
        for i, v in enumerate(node[:3]):
            scan(v, prod, "%s[%d]" % (path, i), depth+1)
    elif isinstance(node, str) and node:
        leaf = path.split(".")[-1]
        by_ext = bool(IMG_EXT.search(node))
        by_key = bool(NAME_HINT.search(leaf)) and ("/" in node or node.startswith("http"))
        if by_ext or by_key:
            paths[path] += 1
            samples.setdefault(path, node)
            evidence[path] = "ext" if by_ext else "key"
            h = urlparse(node).hostname
            if h: hosts[h] += 1

for pid, node in products.items():
    scan(node, pid)

total = len(products)
print("[4] image-ish paths")
if not paths:
    print("    NONE in any product")
    print("    the image is not inside")
    print("    the product node")
def wrap(text, indent, width=36):
    for i in range(0, len(text), width):
        print("%s%s" % (indent, text[i:i+width]))

for path, n in paths.most_common(8):
    print("  %s %d/%d" % (evidence[path], n, total))
    wrap(path, "    ", 34)
    wrap(samples[path][:144], "      ", 32)

print("[5] hosts seen")
if not hosts: print("    none (paths may be relative)")
for h, n in hosts.most_common(5):
    print("    %s  x%d" % (h[:32], n))

# Placeholders are the Flipkart trap: a URL that is a template, not a URL.
tmpl = [p for p, v in samples.items() if "{@" in v or "{{" in v]
print("[6] template placeholders")
print("    %s" % ("YES in %d path(s)" % len(tmpl) if tmpl else "none"))
PY
