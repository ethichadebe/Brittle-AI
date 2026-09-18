# 2026-09-18 — The probe answered the right question about the wrong cookie

- **Asked for:** run the Game probe (PR #56) against the live site.
- **Worked first time:** it ran first time and reported something misleading.
- **Laptop needed:** no.
- **Friction:**
  - **What the live run said.** `HTTP 200` in 10.6s, `_px*: set (_pxhd)`, 10
    cookies, no longer showing "Detecting/Loading", **2 JSON responses — both
    from `collector-pxbia59zcf.px-cloud.net/assets/js/bundle`, scored 0** — and
    **0 prices**.
  - **`_pxhd` is not `_px3`.** I matched `/^_px/` and printed "set". `_pxhd` is
    a device id PerimeterX writes on **every** visit, including ones it goes on
    to reject; `_px3` is the token granted when the sensor is satisfied. So the
    probe reported a pass on a visit that never got one. This is the same shape
    as the `probe-store.sh` false negative fixed hours earlier: a check that
    returns a clean-looking answer to a question adjacent to the one that
    matters. I broadened that pattern deliberately, for safety, and the
    broadening is what made it wrong.
  - **The only two requests captured were PerimeterX's own telemetry.** No
    catalogue request was attempted at all — which is itself the finding, and it
    was nearly invisible: the probe recorded only responses declaring
    `content-type: json`, so a catalogue served as `text/plain` would not have
    appeared either. It now records every `xhr`/`fetch` by resource type and
    lists them all before ranking the JSON-parseable ones.
  - **A block page and an empty result set looked identical.** `[5]` counted
    prices and nothing else, so "0 matches" could not distinguish "PerimeterX
    refused" from "no milk at Game". It now prints the page title and the first
    240 characters of rendered text, which is the cheapest way to tell those
    apart and should have been there from the start.
  - **Two regression tests, both mutation-checked.** A fixture that hands out
    `_pxhd` and withholds `_px3` — Game's exact shape — and a catalogue served
    as `text/plain`. Reverting either fix fails the right assertions.
  - **A mistake in the test file itself, caught by counting.** I appended the
    new cases after the `process.exit(...)` line, so they never ran and the
    suite still reported a clean pass — at 13 assertions rather than 19. The
    only reason I noticed is that I knew how many I had added. Worth
    remembering: a green suite that silently skips its newest cases is exactly
    as reassuring as one that runs them.
  - **Still unresolved:** whether Game is reachable at all. `[5]`'s new output
    decides whether the next lever is `USE_PROXY=1` (a residential IP, one
    ScraperAPI credit) or whether the page is plainly telling us no.
