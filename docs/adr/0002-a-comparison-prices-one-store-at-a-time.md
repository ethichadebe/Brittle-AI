# A Comparison prices one store at a time, and refuses to guess a Substitute

The obvious product is a button that prices a list against every other store at
once. We price against **one** store the shopper chooses. A twenty-item list
compared against the four other stores is eighty searches, of which forty are
metered through ScraperAPI — against a monthly allowance of 1,000, that is
twenty-five comparisons a month across all users, and the cache helps only on
repeats while a new shopper's list is novel by definition. One store at a time
is four times cheaper, shows a result sooner, and answers the question a shopper
actually asks, which is "what would this cost at Checkers?" rather than "give me
a table of four stores I am not going to drive to". All-at-once is deliberately
left as something to sell rather than something already given away.

A **Comparison** also refuses to guess. Where the other store does not sell a
listed product we offer a **Substitute**, because dropping the item would make
a store that stocks less appear cheaper — the comparison failing in the most
misleading direction available to it. But a **Substitute** is judged by **Unit
Price**, never by what one pack costs: swapping 250 g of butter for 500 g looks
like a R45 saving and is half the butter. So when a product's **Pack Size**
cannot be read from its name, we report the item as unmatched rather than
offering a substitute we cannot compare.

## Consequences

Size parsing fails quietly by nature, so failure must mean *no substitute* —
never *assume the sizes agree*. A future reader will be tempted to add a fuzzy
fallback so that fewer items come back unmatched; that trade is unmatched items
for silently wrong totals, and it is the wrong way round. Unmatched is visible
and a shopper can act on it; a manufactured saving is neither.

## Amended 2026-10-19: suggest what can't be compared, never apply it

A live report showed the cost of the original rule. A Woolworths list
compared at Pick n Pay came back "2 of 2 items not found", with no
suggestions at all:

- **Eggs:** Pick n Pay sells the same free-range extra-large 18-pack. Neither
  "18 pk" nor "18 Pack" read as a **Pack Size**, because only mass and volume
  did.
- **Chicken:** Pick n Pay's whole chicken is sold by weight, with no size in
  its name.

Two changes, decided with the owner:

- **A count is a Pack Size.** "18 pk", "18 Pack", "Pack of 6" and "6's" are
  compared per item. That's within the rule as written: a size that can be
  read, judged by **Unit Price**. The eggs now match per egg.
- **Where sizes still can't be compared, the closest names are offered as
  Suggestions, pack for pack.** That covers a size that can't be read on
  either side, or mass against volume. Each one is marked "Can't compare
  sizes · check before you swap".
  - Accucery still never applies one itself.
  - Nothing counts in the total until the **Shopper** picks one, and then it
    counts pack for pack.
  - A **Shopper**'s own pick stays applied on later comparisons, unless a
    confident, comparable **Substitute** turns up.
  - A **Popular Substitute** is never applied pack for pack: it is someone
    else's choice.

What the original Consequences warned against still holds. A size that can't
be read never becomes an *assumed* match or a *silent* saving. The
**Shopper** sees the warning and decides. An unmatched item with nothing to
offer was no better: the shopper had to go and search the other store
themselves.
