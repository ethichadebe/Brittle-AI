# 2026-09-21 — Two prices, two purposes, and a claim of mine that did not hold

- **Asked for:** grill feature 1, the product cache, before building it.
- **Worked first time:** no, and twice the correction came from the right place
  — once from the domain expert's data, once from checking my own reasoning.
- **Laptop needed:** no.
- **Friction:**

  - **The cost picture is worse than "it scales badly".** The ScraperAPI
    dashboard shows 113 of 1,000 credits used with the billing period about
    four days old, and no users — that is development alone on pace for ~850 a
    month. Concurrency is 5, so the per-store serial queue in `engine.ts` is
    Accucery's own choice, not the provider's. The free tier is not a runway
    for the compare feature; it is nearly spent building it.

  - **I generalised Makro's behaviour to Woolworths and was wrong.** I argued a
    name-keyed cache could not work because a store's search is fuzzy, citing
    Makro returning plastic containers for "Eggs". The domain expert produced a
    Woolworths search for "Milk" where all six results carry "Milk" in the
    name. For that store and that query, a substring lookup would have returned
    the same set.

  - **The real objection survived the correction, and is better.** A name-keyed
    cache cannot know whether it holds a *complete* answer. If someone searched
    "Ayrshire" first, a later search for "Milk" matches two rows where the store
    would return six, and nothing records the difference — so a partial answer
    is served as if it were whole. Keying on the query makes a row's existence
    mean "this query was answered", which is the property actually needed.

  - **I had to correct my own recommendation in the same session.** I proposed
    splitting product identity (long-lived) from price (volatile) as if it
    solved the cost problem. It does not. `Scraper` exposes only
    `search(query)` — there is no fetch-by-id — so refreshing one price costs a
    full search, exactly as much as refreshing everything. The split buys
    correctness, one price from one source, and nothing else. Worth saying
    plainly, because the version I first wrote would have been believed.

  - **So the only real lever is staleness, and it is not one number.** A search
    result is for *choosing*; a list total is for *paying*. Those tolerate very
    different ages. Resolved as two terms rather than one setting:
    **Indicative Price** (what a search shows, up to a day old) and **Basket
    Price** (what a list total stands behind, refreshed on open). Cost collapses
    to roughly one scrape per item committed to, not per item browsed.

  - **Left unresolved on purpose.** Nothing in the language yet says which
    **Price Zone** an observed price belongs to. Today one zone serves everyone,
    so it does not bite; under #66 a price observed for one shopper silently
    stops being indicative for another. That is the p60 bug one layer deeper,
    and it decides whether #66 is a migration or a rewrite. Flagged in
    `CONTEXT.md`, not answered.
