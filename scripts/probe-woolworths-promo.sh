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
# This was built around an arithmetic shortcut: on a promoted product the copy
# carries "Now R<x> Save R<y>", and x + y is whatever Woolworths itself treats
# as the regular price, so comparing that sum against the three zones should
# name the zone with nobody reading anything.
#
# THE SHORTCUT DOES NOT WORK, and the 2026-09-21 run is why. Promoted products
# never differ by zone (0/3) while plenty of others do (14/40), so promotions
# are priced nationally and base prices regionally. No number of queries can
# separate the zones this way. Section [3] still reports it, because the
# measurement is what proves the point; section [6] hands over the method that
# is left - one product checked against the live site, by a person.
#
# #28 - WHAT IS INSIDE product_promo_info?
#
# It was assumed to be the structured home of the promotional price that
# `woolworths.ts` currently parses out of marketing copy. IT IS NOT. It holds
# multi-buy promotion metadata - prd_promo_typ, prd_promo_qty, prd_promomsg -
# and the products carrying it are a disjoint set from those with "Now R" copy.
#
# What it does carry is a `loyalty` flag that takes both values, on a product
# that also carries two promos at different prices. That is the lead worth
# chasing, and it needs the promos shown PER PRODUCT rather than aggregated,
# which is what section [4] does now.
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

# Fixed-width wrapping, so a long path or product name still fits a phone.
# Defined here rather than inside [4]: section [6] needs it too, and [4]'s
# branch does not always run.
def wrap(text, indent, width=34):
    for i in range(0, len(text), width):
        print("%s%s" % (indent, text[i:i+width]))


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

    # The paths view above aggregates across products, so it can show that
    # `loyalty` takes both values without showing WHICH promo carries which.
    # The live 2026-09-21 run hit exactly that wall: one product appeared to
    # carry "Buy 2 For R160" and "Buy 2 for R170" with `loyalty` both true and
    # false, and the aggregate could not say whether true went with R160.
    #
    # So: the same promos again, grouped by product. Walked generically rather
    # than by field name - the shape is known today and would break silently
    # the day Woolworths renames something.
    print("\n    per product:")
    shown = 0
    for r in with_ppi:
        if shown >= 3:
            break
        d = r.get("data") or {}
        info = d.get("product_promo_info")
        promos = info if isinstance(info, list) else [info]
        name = str(r.get("value") or d.get("id") or "?")
        wrap(name[:60], "    ")
        for i, promo in enumerate(promos[:2]):
            if not isinstance(promo, dict):
                continue
            print("      promo[%d]" % i)
            for k, v in list(promo.items())[:8]:
                wrap("%s: %s" % (k, v), "        ", 30)
        shown += 1

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

# ---- #27, the method that is left -------------------------------------------
#
# The live 2026-09-21 run established that promoted products never differ by
# zone while plenty of unpromoted ones do, so Now+Save cannot name the zone.
# What is left is the method the issue proposed first: look at what the site
# shows an anonymous visitor and compare.
#
# That needs a person with a browser, so the least this can do is hand them a
# shortlist instead of "go find a product". Each of these has three different
# prices; whichever one the site displays names the zone.
print("\n[6] #27 by hand")
spread = [r for r in results if zones_differ(r.get("data") or {})]
if not spread:
    print("    no product differs by")
    print("    zone in this response,")
    print("    so nothing to check.")
else:
    print("    open woolworths.co.za")
    print("    signed out, search one")
    print("    of these, read the price:")
    for r in spread[:3]:
        d = r.get("data") or {}
        wrap(str(r.get("value") or d.get("id") or "?")[:60], "    ")
        for z in ZONES:
            v = num(d.get(z))
            if v is not None:
                print("      %-4s %.2f" % (z, v))
PY
