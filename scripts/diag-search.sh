#!/usr/bin/env bash
# Why doesn't a search find a product? Read-only, and costs no ScraperAPI
# credits: it only reads what the app already kept.
#
#   cd /opt/accucery && bash scripts/report.sh <issue> -- bash scripts/diag-search.sh "yum yum"
#
# Shows, for searches containing the word(s):
#   - every search the app has kept, per store and price zone (a list with no
#     location searches its store's default branch; one with a location, its
#     own), with how many products it holds and when it was searched
#   - what the Checkers and Shoprite ones hold, in the store's order
#   - the default branches Checkers and Shoprite use without a location
#   - how many searches (of any words) each Checkers and Shoprite price zone
#     has kept, so a zone that never answers stands out
#   - the matching searches, and the store search failures, in the last four
#     days of the backend's log
set -uo pipefail
TERM_="${1:-}"
# Letters, digits and spaces only: it goes into SQL and grep.
if [[ -z "$TERM_" || ! "$TERM_" =~ ^[A-Za-z0-9\ ]+$ ]]; then
  echo "usage: bash scripts/diag-search.sh \"words\"   (letters, digits and spaces only)"
  exit 2
fi
LIKE="%$(echo "$TERM_" | tr '[:upper:]' '[:lower:]' | sed 's/  */%/g')%"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml}"

$COMPOSE exec -T postgres sh -c 'psql -X -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v like="$1"' -- "$LIKE" <<'SQL'
\pset pager off
\echo == Searches the app has kept (newest first) ==
SELECT "storeSlug" AS store, left(zone, 12) AS zone, query, cardinality("productIds") AS products, "scrapedAt" AS searched
  FROM search_cache WHERE query ILIKE :'like' ORDER BY "scrapedAt" DESC LIMIT 20;
\echo == What the Checkers and Shoprite ones hold ==
SELECT s."storeSlug" AS store, left(s.zone, 12) AS zone, s.query, n AS "#", left(coalesce(p."productName", '(no price kept)'), 50) AS product
  FROM search_cache s
  CROSS JOIN LATERAL unnest(s."productIds") WITH ORDINALITY AS u(pid, n)
  LEFT JOIN LATERAL (SELECT "productName" FROM price_cache pc WHERE pc."storeSlug" = s."storeSlug" AND pc."productId" = u.pid LIMIT 1) p ON true
  WHERE s.query ILIKE :'like' AND s."storeSlug" IN ('checkers', 'shoprite')
  ORDER BY s."scrapedAt" DESC, n LIMIT 40;
\echo == Default branches, used without a location ==
SELECT key, "savedAt" AS found, jsonb_array_length(value) AS stores,
       (SELECT string_agg((e->>'storeId') || ' ' || coalesce(e->>'serviceOptionIds', ''), '; ') FROM jsonb_array_elements(value) e) AS "store ids"
  FROM remembered_values WHERE key LIKE 'default-branch:%';
\echo == Searches kept per Checkers and Shoprite zone, any words ==
SELECT "storeSlug" AS store, left(zone, 12) AS zone, count(*) AS searches, max("scrapedAt") AS latest
  FROM search_cache WHERE "storeSlug" IN ('checkers', 'shoprite')
  GROUP BY 1, 2 ORDER BY 1, 3 DESC LIMIT 20;
SQL

echo "== Matching searches in the backend's log, last 4 days =="
GREP="q=$(echo "$TERM_" | sed 's/  */%20/g')"
$COMPOSE logs --since 96h backend 2>/dev/null | grep -i "$GREP" | grep -o '"url":"/search[^"]*"' | sort | uniq -c | tail -20
echo "== Store search failures in the backend's log, last 4 days =="
$COMPOSE logs --since 96h --no-log-prefix backend 2>/dev/null | grep -F "[scraper:" | cut -c1-160 | sort | uniq -c | sort -rn | head -15
echo "(done)"
