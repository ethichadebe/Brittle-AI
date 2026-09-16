#!/usr/bin/env python3
"""Pull the Cookie header out of a copied cURL command and write it into .env
as a correctly quoted CHECKERS_COOKIES line.

    cd /opt/accucery
    cat > /tmp/checkers.curl        # paste the cURL, then press Ctrl+D
    python3 set-checkers-cookie.py  # reads /tmp/checkers.curl by default

Handles the bash form Chrome and Firefox copy (-H 'cookie: ...'), the Windows
cmd form (-H "cookie: ..."), and -b. Prints no cookie values — only lengths and
which fragments were found, so it is safe to run with someone watching.
"""

import pathlib
import re
import shutil
import sys
import time

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/checkers.curl")
ENV = pathlib.Path(".env")


def die(msg: str) -> None:
    print(f"\n  {msg}")
    sys.exit(1)


if not SRC.exists():
    die(f"{SRC} not found. Paste the cURL into it first:\n"
        f"    cat > {SRC}      # paste, then Ctrl+D")
if not ENV.exists():
    die(".env not found — run this from the directory that holds it (/opt/accucery).")

raw = SRC.read_text()

PATTERNS = [
    r"-H\s+'[Cc]ookie:\s*(.*?)'",
    r'-H\s+"[Cc]ookie:\s*(.*?)"',
    r"-b\s+'(.*?)'",
    r'-b\s+"(.*?)"',
]
value = None
for p in PATTERNS:
    m = re.search(p, raw, re.S)
    if m:
        value = m.group(1)
        break

if value is None:
    die("No Cookie header found in that file.\n"
        "  Make sure you used Copy > Copy as cURL (not 'Copy as fetch'),\n"
        "  and that you copied the get-products-filter request.")

# Windows cmd escapes quotes and wraps lines; undo the common cases.
value = value.replace('\\"', '"').replace("^", "").replace("\r", "").replace("\n", "")
value = value.strip().strip(";").strip()

# Compose interpolates $NAME in .env values and silently replaces unknown ones
# with nothing. Real Checkers cookies contain $ sequences, so this quietly eats
# chunks of the value. $$ is Compose's escape for a literal dollar.
dollars = value.count("$")
escaped = value.replace("$", "$$")

if '"' in value:
    die('That cookie contains a double quote, which cannot be safely quoted in\n'
        '  .env. Stop here and say so rather than guessing.')

print(f"\n  cookie found: {len(value)} chars")
if dollars:
    print(f"  dollar signs  : {dollars} escaped as $$ (Compose would eat them)")
for frag in ("storeContexts", "aws-waf-token", "istio-storeIds"):
    print(f"  {frag:<16}: {'yes' if frag + '=' in value else 'NO'}")

if "storeContexts=" not in value:
    die("storeContexts is missing — the app needs it to know which store to price.\n"
        "  Browse to a product page first so the site sets it, then re-copy.")

backup = ENV.with_name(f".env.bak-{int(time.time())}")
shutil.copy2(ENV, backup)

lines = ENV.read_text().splitlines()
new_line = f'CHECKERS_COOKIES="{escaped}"'
replaced = False
for i, line in enumerate(lines):
    if line.startswith("CHECKERS_COOKIES="):
        lines[i] = new_line
        replaced = True
        break
if not replaced:
    lines.append(new_line)

ENV.write_text("\n".join(lines) + "\n")

print(f"\n  .env updated ({'replaced' if replaced else 'appended'}), quoted.")
print(f"  backup: {backup.name}")
print(f"\n  the container should report {len(value)} chars — that is the check.")
print("\n  next:")
print("    rm -f /tmp/checkers.curl")
print("    docker compose -f docker-compose.prod.yml up -d --force-recreate backend")
print("    sleep 20 && bash smoke-scrapers.sh")
