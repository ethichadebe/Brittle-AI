# A Shopper needs no Account, and signing in claims what is already there

Every visitor currently shares one set of lists, which is a privacy leak rather
than a missing feature: the app is deployed, and anyone can read and edit
anyone else's shopping. Fixing that needs a per-device identity, not an
**Account**. So a **Shopper** gets private lists immediately, with no sign-up,
and an **Account** is what later makes those lists survive a cleared browser or
a new phone.

The cost is accepted openly: an anonymous **Shopper** who clears their browser
loses their lists permanently, and no support request can recover them, because
nothing ever proved the lists were theirs. We say so in the app and prompt for
an **Account** once a list is worth keeping, rather than building a recovery
code for anonymous identities — that is an **Account** with worse security and
two recovery systems to maintain.

## Signing in

Signing in claims the lists on the device. Lists that do not collide simply move
across. Two lists collide only when they share **both** a name and a **Store** —
a "Monthly" at Checkers and a "Monthly" at Woolworths are different shopping,
and combining them would produce one list priced against a store that does not
sell half of it.

On a real collision the **Shopper** is asked whether to combine. Combining
merges the items, summing quantities where the same product appears in both.
That is asked rather than assumed because it cannot be undone: a milk of 1 and a
milk of 2 become a milk of 3, and nothing records that it was ever two lists.
Everywhere else in this codebase the rule is visible imperfection over silent
loss; here the merge is the irreversible option, so the person who knows whether
those two lists are the same shopping is the one who decides.

## Consequences

Because claiming happens at sign-in, signing out can hand the device a fresh
anonymous identity with nothing stranded behind it. Without the claim, sign-out
would have to decide whether to restore a pre-sign-in identity — which on a
shared phone is how one person's groceries end up in front of another.

Storing email addresses brings Accucery under POPIA. That obligation arrives
with **Accounts**, not with anonymous identities, and is cheaper to design for
than to retrofit.
