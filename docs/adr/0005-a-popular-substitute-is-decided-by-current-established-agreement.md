# A Popular Substitute is decided by current, established agreement

A **Substitute** a Shopper picks is a preference, not a fact (#91), so it only
ever changes their own totals. A **Popular Substitute** (#103) is the one
exception: once enough Shoppers have chosen the same pairing, Accucery applies
it to everyone who hasn't decided otherwise, changing other people's totals on
the strength of strangers' taps. We decided it on the current decisions of
**established** Accounts, with **removals counting against** a pairing, against
a **fixed threshold raised by hand**, and it never outranks a Shopper's own
decision.

- **Current decisions, removals against.** Each Account holds one decision per
  pairing, and the most recent wins, so someone who changes their mind stops
  counting. A pairing needs at least 3 choices and at least twice as many
  choices as removals. Counting removals is what lets a wrong Popular
  Substitute correct itself: the Shoppers who untick it are what take it down,
  without anyone having to notice. Counting choices alone would let ten picks
  outvote fifty rejections.
- **Established Accounts only.** An Account counts once it is 3 days old. There
  is no email verification and a saved decision isn't checked against what a
  comparison actually offered, so without this, scripting a few sign-ups would
  make any pairing popular within a minute. The age check makes that slow and
  visible rather than impossible. A patient attacker still gets through, which
  is why a Popular Substitute is always labelled, always removable, and
  self-correcting.
- **A fixed threshold, raised by hand.** We considered scaling it with the
  number of Accounts. Rejected: a pairing would then stop being popular just
  because the app grew, and Shoppers' stand-ins would change with no visible
  reason. Starting at 3 is deliberately low, so the feature can be tested with
  a handful of real users. It is one constant (`POPULAR_MIN_CHOICES`), meant to
  rise as the app gets users, and that change gets its own PR saying why.

## Consequences

A future reader will be tempted to make popularity stronger, for example by
letting it override a Shopper's removal, or counting every tap rather than
current decisions. Both trade a Shopper's control over their own total for
other people's opinions, which is the wrong way round for a feature whose whole
justification is reducing that Shopper's friction. Email verification (when it
exists) would be the right replacement for the 3-day age check, not an addition
to the threshold.
