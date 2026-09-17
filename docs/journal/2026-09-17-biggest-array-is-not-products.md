# 2026-09-17 — The biggest array was not the products

- **Asked for:** find where Makro keeps its products.
- **Worked first time:** no. The probe found embedded JSON on the first run and
  then pointed at the wrong arrays, confidently.
- **Laptop needed:** no. Free — Makro is fetched directly, no credits.
- **Friction:**
  - `probe-makro.sh` ranked arrays of objects by **size**, and its own closing
    note said "the products are almost certainly the largest one". On Makro the
    two biggest are the router config (47 items) and one facet's filter values
    (34). The results are smaller than both. A heuristic stated as a near
    certainty, wrong on the first real page it met.
  - Ranking is by **product-likeness** now: a price field scores 3, a title or
    name 2, an image 1, an id 1. On a fixture built to reproduce the failure —
    47 config items and 34 facet items against 12 products — the products come
    first at score 6 against the config's 2. Size is still printed, just not
    trusted.
  - Added step [4], which is the decisive one: every numeric field anywhere in
    the embedded data whose path ends in something price-shaped. If that comes
    back empty, the products are not in the page at all and the next step is the
    XHR endpoint rather than more digging in HTML. That is a cheaper question
    than "which array is it" and should probably have been asked first.
  - Two rounds of duplicate output, both from the same cause: the same data is
    reachable by more than one route. Walking three elements of an array
    reported one field three times, fixed by collapsing `[0]`, `[1]`, `[2]` to
    `[]`. Then `__INITIAL_STATE__` and `pageDataV4` matched overlapping objects,
    so each field appeared once per blob root — collapsed to the last four path
    segments, which is what gets displayed anyway. Fifteen entries became three.
  - A note also had to change, not just code: leaving "the products are almost
    certainly the largest one" in the output would have taught the next reader
    the same wrong thing the code had just been fixed for.
