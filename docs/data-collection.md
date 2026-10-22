# Data collection

Since 2026-10-22 the app keeps data it used to throw away, for features and
insights later. Nothing in the app reads it yet. All of it lives in the same
Postgres database; `backend/src/services/collect.ts` writes it, and a failed
write is logged (`[collect]`) and never breaks what the shopper was doing.

| Table | One row per | Linked to a shopper? |
| --- | --- | --- |
| `price_history` | product, store, zone and Joburg day (the day's last price) | No |
| `search_log` | search answered, with how many products came back. The app searches as you type, after a short pause, so some rows are part of a word | No |
| `compare_log` | comparison: both totals, and how each item matched (`items`) | No |
| `shopping_events` | item added to a list (`added`) or ticked off (`ticked`), with price, quantity, phone model and platform | Yes: `ownerId` is the Account, or the device without one |
| `history_opt_outs` | Account or device that switched its shopping history off | Yes |

## Shopping history and the shopper

- On by default; the shopper turns it off on Profile ("Keep my shopping
  history"). Turning it off deletes what was kept and stops it.
- When a device signs in, its history moves to the Account. A device that had
  it off turns it off for the Account too.
- Deleted with the Account.
- The phone model comes from Chrome's `Sec-CH-UA-Model` client hint, which
  nginx asks for with `Accept-CH` (`nginx-security-headers.conf`). iPhones and
  computers give only a platform.
- The privacy notice (`frontend/src/components/PrivacyNotice.tsx`) says all of
  this. Change it in the same pull request as anything here.

## Looking at it

On the server, from `/opt/accucery`:

```sh
docker compose -f docker-compose.prod.yml exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

```sql
-- How a product's price moved
SELECT day, "regularPrice", "loyaltyPrice" FROM price_history
WHERE "storeSlug" = 'checkers' AND "productName" ILIKE '%full cream milk 2l%' ORDER BY day;

-- Searches that found nothing this week: products the stores may be missing
SELECT query, "storeSlug", count(*) FROM search_log
WHERE "resultCount" = 0 AND at > now() - interval '7 days' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20;

-- Which store wins comparisons, and by how much on the matched items
SELECT "fromStore", "toStore", count(*), round(avg("fromMatchedTotal" - "toTotal"), 2) AS avg_saving
FROM compare_log GROUP BY 1, 2 ORDER BY 3 DESC;

-- Most bought products
SELECT "productName", "storeSlug", count(*) FROM shopping_events
WHERE kind = 'ticked' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20;
```
