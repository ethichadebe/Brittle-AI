#!/usr/bin/env bash
# Settles issue #27 and issue #28 in one run.
#
#   cd /opt/accucery && bash scripts/probe-woolworths-promo.sh [query]
#
# #27 - WHICH PRICE ZONE DOES AN ANONYMOUS SHOPPER PAY?
#
# Woolworths prices every product for p10, p30 and p60 at once and they
# disagree on most products. `woolworths.ts` defaults to p60 and records that
# as a guess; if it is wrong, every Woolworths price is wrong and nothing looks
# broken.
#
# The issue proposes reading a product page by eye. That is not needed: on a
# promoted product the promo copy carries "Now R<x> Save R<y>", and x + y is
# whatever Woolworths itself treats as the regular price. Comparing that sum
# against the three zones names the zone arithmetically, on every promoted
# product in the response at once, with nobody reading anything.
#
# #28 - WHAT IS INSIDE product_promo_info?
#
# It is the one field present on promoted products and absent from the rest,
# so it is the likely structured home for the promotional price that is
# currently parsed out of marketing copy. Nobody has ever seen inside it - the
# VPS terminal kept dropping before the output rendered. This prints its shape
# and its values, and says whether any leaf equals the price the copy claims.
#
# Costs no ScraperAPI credits: Woolworths answers directly, and Constructor.io
# is a public search endpoint.
#
# Output stays under 40 columns. Prints no key and no .env value.

set -uo pipefail

QUERY="${1:-milk}"
WW="https://www.woolworths.co.za"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
TMP="${PROBE_FIXTURE_DIR:-$(mktemp -d)}"
[ -n "${PROBE_FIXTURE_DIR:-}" ] || trap 'rm -rf "$TMP"' EXIT
command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

PAGE="$TMP/search.json"

if [ -n "${PROBE_FIXTURE_DIR:-}" ]; then
  echo "[1] fixture: $(wc -c < "$PAGE") bytes"
else
  # The same public client key woolworths.ts uses. Never echoed: it is not a
  # secret, but this repo is public and printing values is how the last leak
  # happened.
  #
  # env-secret-assignment matches the NAME. This line assigns an expansion, not
  # the literal value that rule is looking for ("Secret-looking environment
  # variable assigned a literal value"), and WOOLWORTHS_SEARCH_KEY is
  # Constructor.io's public client key, served to every visitor in
  # woolworths.co.za's own bundle. Marked on the line below, as the rule reads.
  KEY="${WOOLWORTHS_SEARCH_KEY:-}" # gitleaks:allow -- expansion, not a literal
  [ -n "$KEY" ] || KEY=$(sed -n 's/^WOOLWORTHS_SEARCH_KEY=//p' .env 2>/dev/null | head -1)
  if [ -z "$KEY" ]; then
    echo "[1] no WOOLWORTHS_SEARCH_KEY"
    echo "    set it in .env, or read it"
    echo "    with probe-woolworths-search"
    exit 1
  fi
  urlenc() { printf '%s' "$1" | sed 's|%|%25|g; s| |%20|g; s|&|%26|g; s|?|%3F|g'; }
  CODE=$(curl -s -o "$PAGE" -w '%{http_code}' -m 90 \
    -H "User-Agent: $UA" -H 'Accept-Language: en-ZA,en;q=0.9' \
    -H "Referer: $WW/" \
    "https://ac.cnstrc.com/search/$(urlenc "$QUERY")?key=${KEY}&num_results_per_page=40" \
    2>/dev/null || echo 000)
  printf '[1] search %s  %s bytes\n' "$CODE" "$(wc -c < "$PAGE" 2>/dev/null || echo 0)"
  [ "$CODE" = "200" ] || { echo "    not 200, stopping"; exit 1; }
fi

python3 - "$PAGE" <<'PY'
import json, re, sys
from collections import Counter, defaultdict

try:
    raw = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as e:
    print("[2] unparseable: %s" % type(e).__name__)
    sys.exit(1)

results = (raw.get("response") or {}).get("results") or []
ZONES = ["p10", "p30", "p60"]

# The same two numbers woolworths.ts reads, plus the one it does not.
NOW = re.compile(r"\bnow\s*R\s*(\d+(?:[.,]\d{1,2})?)", re.I)
SAVE = re.compile(r"\bsave\s*R\s*(\d+(?:[.,]\d{1,2})?)", re.I)

def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None

def money(s):
    return float(s.replace(",", "."))

def promo_lines(data):
    p = data.get("promo")
    if isinstance(p, list):
        return [str(x) for x in p]
    return [str(p)] if p else []

print("[2] products: %d" % len(results))
if not results:
    print("    nothing to inspect")
    sys.exit(0)

with_ppi = [r for r in results if (r.get("data") or {}).get("product_promo_info")]
with_copy = [r for r in results
             if any(NOW.search(l) for l in promo_lines(r.get("data") or {}))]
print("    product_promo_info: %d" % len(with_ppi))
print("    'Now R' in promo:   %d" % len(with_copy))

# ---- issue #27: which zone equals Now + Save? -------------------------------
print("\n[3] #27 zone by Now+Save")
votes = Counter()
checked = 0
misses = []
promoted_rows = []
for r in results:
    d = r.get("data") or {}
    lines = promo_lines(d)
    now = save = None
    for line in lines:
        m, s = NOW.search(line), SAVE.search(line)
        if m and s:
            now, save = money(m.group(1)), money(s.group(1))
            break
    if now is None or save is None:
        continue
    checked += 1
    promoted_rows.append(r)
    target = now + save
    # num() is for safety against a non-numeric value, not for excluding zero:
    # a zone a product is not sold in reports 0, and 0 cannot equal a positive
    # now+save anyway. Saying that rather than writing a zero check that never
    # fires and a test that cannot exercise it.
    hit = []
    for z in ZONES:
        v = num(d.get(z))
        if v is not None and abs(v - target) < 0.01:
            hit.append(z)
    for z in hit:
        votes[z] += 1
    if not hit:
        misses.append((target, [num(d.get(z)) for z in ZONES]))

# Does this product cost different amounts in different zones at all?
#
# Without this, an all-agree result is unreadable: it could be an unlucky
# sample, or it could be that promoted products are simply priced the same
# everywhere - in which case Now+Save can never name a zone however many
# queries you try, and retrying is wasted effort.
def zones_differ(d):
    vals = [v for v in (num(d.get(z)) for z in ZONES) if v is not None]
    return len(set(vals)) > 1

prom_differ = sum(1 for r in promoted_rows if zones_differ(r.get("data") or {}))
all_differ = sum(1 for r in results if zones_differ(r.get("data") or {}))

print("    promoted w/ Now+Save: %d" % checked)
if not checked:
    print("    none in this query -")
    print("    try another, e.g. bread")
else:
    for z in ZONES:
        print("    %-4s matched %d/%d" % (z, votes[z], checked))
    print("    zones differ on")
    print("      promoted: %d/%d" % (prom_differ, checked))
    print("      all:      %d/%d" % (all_differ, len(results)))
    # Only a zone that matches every promoted product is an answer. One that
    # matches some is a coincidence of products whose zones happen to agree.
    clean = [z for z in ZONES if votes[z] == checked]
    if len(clean) == 1:
        print("    => %s is the regular price" % clean[0])
    elif len(clean) > 1:
        print("    => %s all agree here" % ",".join(clean))
        if prom_differ == 0 and all_differ > 0:
            # The decisive case: the catalogue IS zone-priced, but the
            # promoted subset is not. Retrying cannot help.
            print("    promoted items never")
            print("    differ by zone, though")
            print("    %d other products do." % all_differ)
            print("    Now+Save cannot settle")
            print("    #27 - needs another")
            print("    method, not another")
            print("    query.")
        else:
            print("    unlucky sample; retry")
            print("    with another query.")
    else:
        print("    => no zone matches. the")
        print("    copy may have changed.")
    for target, zs in misses[:2]:
        print("    miss: want %.2f" % target)
        print("      got %s" % zs)

# ---- issue #28: what is inside product_promo_info? --------------------------
print("\n[4] #28 product_promo_info")
if not with_ppi:
    print("    absent on every product")
    print("    in this response")
else:
    paths = defaultdict(list)

    def walk(node, path=""):
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, "%s.%s" % (path, k) if path else k)
        elif isinstance(node, list):
            for i, v in enumerate(node[:2]):
                walk(v, "%s[%d]" % (path, i))
        else:
            paths[path or "(scalar)"].append(node)

    for r in with_ppi[:5]:
        walk((r.get("data") or {}).get("product_promo_info"))

    print("    on %d products, %d paths" % (len(with_ppi), len(paths)))
    def wrap(text, indent, width=34):
        for i in range(0, len(text), width):
            print("%s%s" % (indent, text[i:i+width]))
    for p, vals in list(paths.items())[:10]:
        wrap(p, "    ")
        # Every DISTINCT value, not just the first. A flag like `loyalty` is
        # only interesting if some product carries the other value, and
        # printing one sample hides exactly that.
        distinct = []
        for v in vals:
            s = str(v)
            if s not in distinct:
                distinct.append(s)
        wrap(" | ".join(distinct)[:96], "      ", 32)

    # The question behind #28: does a leaf carry the promotional price as a
    # number, so the parser can stop reading marketing copy?
    wanted = []
    for r in with_ppi:
        d = r.get("data") or {}
        for line in promo_lines(d):
            m = NOW.search(line)
            if m:
                wanted.append(money(m.group(1)))
                break
    hits = set()
    for p, vals in paths.items():
        for v in vals:
            n = num(v) if not isinstance(v, bool) else None
            if n is not None and any(abs(n - w) < 0.01 for w in wanted):
                hits.add(p)
    print("\n[5] a leaf equal to 'Now R'?")
    if hits:
        for p in sorted(hits)[:4]:
            wrap(p, "    ")
        print("    => read this, not the copy")
    elif wanted:
        print("    no. the price is only in")
        print("    the copy; keep parsing it")
    else:
        print("    no 'Now R' to compare to")
PY
