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
