# 2026-10-06 — Spend far fewer ScraperAPI credits

- **Asked for:** #157. A conversation first, on getting the most from the
  free plan's 1,000 credits a month, then the changes. Decisions are recorded
  on the issue.
- **What was found:** the credits mostly went on restarts, not shoppers.
  - Every deploy restarts the server, and its test copy too.
  - Each restart looked up the default Checkers and Shoprite branches from
    scratch: ~15–25 requests for Shoprite, because Sandton's own Shoprite
    doesn't deliver.
  - There were ~50 deploys between 20 Sep and 6 Oct.
- **What changed:**
  - **Default branches are kept in the database for 7 days**, so a restart
    reads them back for free.
  - **Shoprite's default is looked up from Sophiatown**, the store that
    prices Joburg. It's the first store asked, not the twelfth.
  - **Every credit is counted** in the database, by day and purpose. A
    daily allowance that refused requests past 33 credits was built, then
    taken out on the owner's review: "try again tomorrow" is worse for
    shoppers than buying a bigger plan. Nothing is refused now; the counts
    are for the report.
  - **Checkers and Shoprite prices are reused for longer** (decided with the
    owner): a day for a list item, 3 days for a search. The free stores keep
    an hour and a day.
  - **Every search keeps all ~20 prices** it returns, not just the one a
    refresh was after.
  - **Shoprite asks the nearest 8 stores, one at a time**, instead of 25,
    four at once.
  - **No browser fallback through ScraperAPI.** A full page load costs
    dozens of credits and rarely got through.
  - **A credit report for the server:** spend per day and purpose, beside
    ScraperAPI's own count for the month.
- **Worked first time:** mostly.
  - Seven branch tests and six freshness tests described the old rules;
    they were updated to the decisions.
  - Capping Shoprite at 8 would have quietly broken its default if
    Sophiatown sat past 8th from Sandton (it was only known to be "within
    25"). Starting the default lookup at Sophiatown removes the question.
  - Each safeguard was mutation-checked: removing it fails a test.
- **Laptop needed:** no.
- **Friction:**
  - **The credits are exhausted until the plan renews**, so none of this can
    be seen live yet. The report will show the first days after renewal,
    and when spend is heading past the month's 1,000.
  - **Unconfirmed: whether ScraperAPI charges exactly 1 credit per request**
    to these sites. The report puts the app's count next to ScraperAPI's,
    so a difference will show.
  - **Sophiatown's coordinates are approximate.** If they're off, the lookup
    still asks the nearest 8 stores from there.
