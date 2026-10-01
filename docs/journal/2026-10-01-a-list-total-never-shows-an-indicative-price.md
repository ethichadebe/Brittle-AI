# 2026-10-01 — A list total never shows an Indicative Price

- **Asked for:** #77, grilled first. Three decisions came out of it: an
  opened list shows its total straight away, marked provisional while old
  prices refresh; a price that can't be refreshed stays in the total,
  saying how old it is; and the home screen's totals are estimates from
  the latest prices seen, with no scraping.
- **Worked first time:** yes, against those decisions.
- **Laptop needed:** no.
- **Friction:**

  - **Most of the issue's machinery already existed; the two real gaps
    didn't show from the issue text.** The two windows were already
    separate (a day for a search, an hour for a list) and opening a list
    already re-scraped old prices directly from the store. The gaps:
    - *Adding an item laundered its price.* `POST /lists/:id/items` wrote
      the phone's price into the shared `price_cache` stamped "now". A
      price from a day-old cached search therefore looked an hour fresh and
      skipped the refresh. That's exactly #77's failure, and it also let any
      client set the shared price every shopper sees. It no longer writes
      the cache at all: the search that showed the product already recorded
      it with its real age. `zone` is no longer sent with an add, since
      writing the cache was its only use.
    - *Fresh prices never reached the screen.* The refresh ran in the
      background and nothing asked again, so the total shown was the old
      one until the next visit. The original PRD said the screen "updates
      reactively when fresh prices arrive". That half was never built.

  - **The home screen had a third, quieter version of the same problem.**
    Its totals summed the price each item had *when added*, which nothing
    ever updates, so a weeks-old list showed weeks-old prices. Not in the
    issue; found reading `lists.ts`, and settled while grilling.

  - **Polling needed a brake on the server, not just the page.** The page
    re-asks every 3 s while anything is "updating". A product the store no
    longer returns would otherwise be re-scraped on every one of those
    requests. `basketPrices.ts` keeps an in-memory note per product of a
    refresh in flight or one that just failed. Asking again within two
    minutes of a failed attempt reports "outdated" without scraping. The
    note lives in the one backend process, so a restart forgets it: the
    cost is one extra attempt.

  - **Every response carries the Basket Price now, not just opening the
    list.** Changing a quantity used to return the item at its add-time
    price, so the price on screen jumped back after any `+`/`−`. Add, edit
    and open all go through the same pricing function.

  - **Mutation-checked as the issue asked.** Pointing the list at the
    search window fails with "a list total showed an indicative price as
    if it were current". Restoring the old add-item cache write fails the
    add test, and removing the retry brake fails the "doesn't re-scrape"
    test.

  - **Checked in a browser against canned responses:** the "updating"
    markers and banner on open, the page asking again after 3 s, one price
    updating and the other turning to "price from 3 days ago, couldn't
    update", then no further requests. The home screen reads "≈ R …" under
    "Est. total".

  - **Next:** live-test on a list not opened for a while. Expect "Updating
    prices…" for a few seconds, then the numbers to move by themselves.
