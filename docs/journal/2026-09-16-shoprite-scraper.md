# 2026-09-16 — Shoprite, by making Checkers into a platform

- **Asked for:** a Shoprite scraper — "it's built exactly like the Checkers
  website so we can replicate that logic or centralise it if possible."
- **Worked first time:** yes, because the probe went first. `probe-shoprite.sh`
  had already shown both sites answering the same endpoint with the same
  top-level keys and the same first-product field names, so this was wiring
  rather than reverse engineering. Replicating would have worked too; sharing
  one implementation is better, and the probe is what made that safe to claim.
- **Laptop needed:** no. This session cannot reach either store, so the proof is
  unit tests over captured shapes plus a fake-network run of the real engine, not
  a live search. A live search is still owed on the VPS.
- **Friction:**
  - `checkers.ts` became `shopriteGroup.ts`, taking the two things that actually
    differ — which host to ask, which env var holds that host's cookie. Named for
    the group rather than either brand, because "shoprite.ts" next to a Shoprite
    store slug would be a trap for the next reader.
  - The whole risk of sharing an implementation is Shoprite silently asking
    Checkers, or pricing against a Checkers store. Two tests pin exactly that,
    and both were checked by mutation: pointing Shoprite's origin at Checkers
    fails two tests, and making it read `CHECKERS_COOKIES` fails two.
  - `storeContexts` is per-retailer, so a Checkers value means nothing to
    Shoprite. Unlike Checkers, Shoprite returned products with an empty one, so
    `SHOPRITE_COOKIES` is optional — the site falls back to its own default
    store. That is a real difference in behaviour, not a shrug: prices without it
    may not be the ones a given branch charges, and the README says so.
  - `set-checkers-cookie.py` is now `set-store-cookie.py` and takes a store name.
    Leaving it Checkers-only would have meant the next Shoprite cookie refresh
    becoming a hand-pasted block again, which is the thing the previous pull
    request existed to stop.
  - `SCRAPERAPI_KEY` was still missing from `.env.example` — the same absence
    that let the VPS run without it for four months. Added, with what it is for.
  - The four `any` disables in the files this touches now carry `--` reasons, as
    CLAUDE.md asks; they were inherited without them. `pnp.ts` still has four
    bare ones. Left alone deliberately — nothing here touches that file, and
    widening a pull request to tidy something adjacent is how a small change
    stops being reviewable.
