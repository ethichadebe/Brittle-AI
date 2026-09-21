# Comparing requires an Account

ADR 0002 lets a **Shopper** compare a list against one other **Store**. ADR 0003
lets a **Shopper** use Accucery with no **Account** at all. Each is right on its
own, and together they leave the one operation that spends money uncapped.

A comparison costs what the target store costs. Checkers and Shoprite go through
a metered proxy, so a twenty-item list compared against either is twenty
credits, against a monthly allowance of 1,000 — about fifty such comparisons a
month across every user there is. Woolworths and Makro cost nothing. An
anonymous identity cannot be counted against, because clearing a browser mints a
fresh one, so one person pressing a button can spend the month in an afternoon
without attacking anything.

So a **Comparison** requires an **Account**. Not as a paywall — as the only
identity that can be counted. The line this draws also explains itself to a
shopper: **anonymous for what is cheap, an Account for what costs money.** Lists
and search stay free and need no sign-up; they are cacheable and nearly free
once repeat searches are served from the cache.

## Consequences

Compare now depends on accounts rather than merely being improved by them, which
fixes the build order: cache, then accounts, then compare. ADR 0002 already
reserves all-at-once comparison as something to sell, and an anonymous browser
cannot be billed, so both halves of that plan want the same prerequisite.

This was not visible from either grilling alone. It appeared only where the two
decisions met, which is an argument for re-reading settled ADRs against each new
one rather than treating them as finished.
