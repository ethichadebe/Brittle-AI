# 2026-09-17 — Removed four stores that were never more than a guess

- **Asked for:** "the most reasonable next store is Game, and I think the rest
  of the stores need to be removed as they don't really have an online catalogue
  like the rest of the stores we've already built for."
- **Worked first time:** yes.
- **Laptop needed:** no.
- **Friction:**
  - **Removed:** OK Foods, Usave, Food Lover's Market and Boxer. They existed
    only as `StoreSlug` union members and `STORE_CONFIGS` entries — no scraper,
    no engine registration, no image-proxy host — so removing them touched two
    files and no behaviour.
  - **I am the one who added them**, earlier the same day, on my own
    recommendation and without probing any of them. The comment I left above
    them admitted it: "Candidates, none of them probed yet. Every field below is
    a starting point rather than a fact." A store card that says "coming soon"
    for something with no online catalogue is a promise the app cannot keep, and
    six of them sat against five working stores. SPAR was the same mistake and
    was removed for the same reason; I repeated it four more times in one go.
  - **One I would check before calling it settled.** My own note on Food Lover's
    Market read "an independent grocer with its own online shopping, so the most
    likely of these four to be a real catalogue on its own platform." That was
    unprobed too, so it is not evidence against the removal — but it is the one
    entry where my earlier reading and this decision disagree. Recorded here
    rather than argued: re-adding a config is a few lines, and
    `scripts/probe-store.sh https://www.foodloversmarket.co.za` settles it in one
    command if it ever matters.
  - **Game stays**, inactive, as the last candidate. It is Massmart — the same
    owner as Makro — so it may run the same Flipkart stack `makro.ts` already
    parses. Its config comment now says that is a hypothesis and points at
    issue #35, rather than leaving a bare entry that reads like a decision.
  - **Net effect on the home screen:** one "coming soon" card against five
    working stores, down from six against five.
