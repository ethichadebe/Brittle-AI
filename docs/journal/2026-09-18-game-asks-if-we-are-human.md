# 2026-09-18 — Game asks if we are human, so Game is out

- **Asked for:** "let's drop game from the list" — after the browser probe
  settled what Game actually serves.
- **Worked first time:** the removal, yes. Reaching the answer took three probe
  rounds and two corrections to my own probe.
- **Laptop needed:** no.
- **Friction:**
  - **The line that ended it.** `probe-game.mjs`, run in a real browser inside
    the backend container:

        [5] title:     Are you a human?
            body text: Are you a human? Press and hold the button below to
                       confirm. Thank You!

    Not an empty result set, not a catalogue — a PerimeterX interstitial. The
    only requests captured were PerimeterX's own telemetry to
    `collector-pxbia59zcf.px-cloud.net`, because the app never cleared the gate
    and so never asked for products.
  - **This is a different thing from the Checkers WAF.** Checkers and Shoprite
    block datacenter IPs and serve content to a better-reputation one; that is a
    filter. A press-and-hold challenge is an interactive human-verification
    gate. Getting past it means defeating that mechanism, which this project
    does not do.
  - **`USE_PROXY=1` was not attempted.** A residential IP might mean the
    challenge is never served — that is arriving with better reputation rather
    than solving anything. It was judged not worth a ScraperAPI credit: Game is
    a general merchandiser weighted toward appliances, and Makro already showed
    what that costs when "Eggs" returned plastic egg containers.
  - **I recommended stopping before the probe and was overruled, correctly.**
    The decision then rested on my guess that PerimeterX would be expensive. The
    probe replaced the guess with a screenshot of the actual gate, which is a
    much better basis for the same conclusion — and if it had come back with a
    catalogue, I would have been wrong. That is the case for probing rather than
    arguing.
  - **`scripts/probe-game.mjs` stays.** It is not Game-specific: `TARGET` and
    `ORIGIN` point it at any store, and it is the only probe here that drives a
    real browser. Its header now records the Game verdict and the evidence, so
    the next session does not re-run the same three rounds. Issue #35 is closed
    with the same evidence.
  - **Net effect:** `StoreSlug` is five entries, all live, and the home screen
    shows no "coming soon" cards at all — down from six against five yesterday
    morning. Nothing in the frontend needed changing: inactive stores were never
    a separate section, just a badge, so zero of them renders cleanly.
  - **What the store list cost to get honest.** SPAR, OK Foods, Usave, Food
    Lover's Market, Boxer and now Game — six entries removed in two days, five
    of which I added myself on recommendation without probing any of them. The
    list is now exactly the stores that work.
