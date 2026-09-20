# 2026-09-20 — Ask whether Makro carries a food signal at all

- **Asked for:** Makro's food filter is the deferred note that affects real
  users — searching "Eggs" returns plastic egg containers at R123–R298 on a live
  store. Woolworths solved the same problem with `isFood()` on `prodtype`. The
  instruction was explicit: **probe whether Makro's product nodes carry a
  category field before writing anything.**
- **Worked first time:** no, and usefully so — the first version of the probe
  nominated the product title as the answer.
- **Laptop needed:** no to build it. Yes to run it: it needs the live page, which
  a cloud session cannot reach.
- **Friction:**

  - **Grepping for a key called "category" would have been the wrong probe.**
    That is how `makro.ts` shipped reading `node.imageUrl`, a field that does not
    exist on any Makro product. And a field named `category` is worthless if
    every product in a grocery search carries the same value, while a field named
    anything at all is the answer if it says "Home" for the egg containers and
    "Food" for the milk. So the test is **separation**, not naming: run several
    queries, keep every low-cardinality string the product nodes carry, and
    report which take disjoint values across a food query and a non-food one.

  - **The first version nominated `titles.title`.** Every product has a distinct
    title, so titles are trivially disjoint between any two queries — they would
    have topped the list while meaning nothing. That is the same mistake as
    ranking arrays by size, which this probe's sibling made twice: an incidental
    property of the data standing in for relevance. Fixed by requiring the field
    to **group** products — fewer distinct values than there are products, in at
    least one query. A department groups; a name does not.

  - **Four mutations, each caught.** Drop the grouping rule and the title is
    nominated; drop disjointness and a brand wins; scan only depth 1 and the
    nested path goes unreported; drop the constant-field rule and an
    always-the-same flag floods the near-miss list.

  - **One of those four initially passed under mutation, which was the real
    find.** The assertion for the constant-field rule checked only section `[3]`
    — but a constant field can never be disjoint, so `[3]` rejects it via
    disjointness whether or not the rule exists. What the rule actually buys is a
    clean `[4]`. The assertion now covers the whole output. A test that passes
    for a reason other than the one it names is the thing this repo keeps
    getting caught by.

  - **It reports a null result as an answer.** If no field separates the
    queries it says "no category field here", and if a query returns fewer than
    three products it says grouping cannot be demonstrated rather than reporting
    a confident zero. Both matter, because "Makro has no usable signal" is a
    perfectly possible outcome and would decide the design.
