# A Price Zone is identified by whatever the store itself calls it

Prices in this repo are cached, and a cached price is only valid for the
**Price Zone** it was observed in — so the zone belongs in the cache key. But
the stores share no vocabulary for zones: Woolworths uses a price band
(`p10`/`p30`/`p60`), Checkers and Shoprite use a particular physical branch via
`storeContexts`, and Makro appears to have none. We record the store's own
identifier verbatim, opaque to us, rather than mapping it to a region concept
of our own such as "gauteng".

## Considered options

Our own region concept reads better and would let us ask cross-store questions
like "show me Gauteng prices". It is also blocked: issue #66 establishes that
nobody has the location-to-zone mapping for **any** store, and that finding it
is a separate per-store investigation. The opaque identifier needs no mapping,
can be written today, and still answers the only question the cache actually
asks — *is this row valid for this shopper at this store?* A region concept can
be layered on later as a lookup without touching the cached rows.

## Consequences

The zone must be written **at the moment of the scrape**, with the real value,
even though one zone serves every shopper today. A placeholder such as `NULL`
or `"default"` would leave rows whose zone is unknown rather than merely
uniform, and unknown rows have to be discarded when #66 lands. Writing the real
value is the difference between #66 being a migration and being a rewrite.
