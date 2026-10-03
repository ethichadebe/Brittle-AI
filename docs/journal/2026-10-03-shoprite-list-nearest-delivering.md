# 2026-10-03 — A Shoprite list priced at the nearest Shoprite that delivers (#134)

- **Asked for:** #134. A Shoprite list gets the nearest Shoprite that
  delivers and actually sells. If there isn't one, the list stays on the
  default prices and says Shoprite doesn't deliver near you. The rules were
  settled on #66, so there was nothing new to grill.
- **Worked first time:** the code did. One new test failed until I noticed
  its test location was exactly the default Sandton point, which the
  stand-in answers differently. The "finding" line also needed to wrap.
  Not yet seen against the real Shoprite.
- **Laptop needed:** no.
- **Friction:**

  - **Every candidate store is test-searched.** On #66, Milnerton and
    Rustenburg named a delivering store and sold nothing. Before Shoprite's
    lookup accepts a branch, it now searches it once ("milk") and skips it
    if nothing comes back. This applies to Shoprite only; Checkers' branches
    have always sold.

  - **"Doesn't deliver here" is never a guess.** A failed request now fails
    the whole lookup rather than being skipped. Otherwise a ScraperAPI
    hiccup would be saved as "Shoprite doesn't deliver near you", which is
    the worst wrong answer, because it stops the shopper from trying again.

  - **The lookup can take a minute,** longer than a web proxy keeps a
    request open (60 s).
    - `PUT /lists/:id/location` now starts the lookup, waits up to 20 s,
      then answers either the result or "still finding" (202).
    - The phone asks `GET /lists/:id/location` every 3 s, for up to three
      minutes.
    - A second ask joins the lookup already running instead of starting
      another.
    - After a reload the list notices a lookup still running on the server
      and keeps waiting for it.
    - Nearby stores are checked four at a time: quicker, without asking
      ScraperAPI for too many requests at once.

  - **The branch is named after the store that delivers** (e.g. Shoprite
    Sophiatown), not the store nearest the shopper.

  - **Out of delivery is saved on the list.**
    - The list shows "Joburg prices · no delivery near you", and once, under
      the header: "Shoprite doesn't deliver near you, so this list shows
      Joburg prices. In-store prices may differ."
    - It no longer offers "Use my location" again. Choosing another branch
      is #136.

  - **Mutation-checked,** four breaks, each caught by the tests:
    - dropping the test search;
    - skipping failed requests;
    - not saving "out of delivery";
    - making PUT wait for the whole lookup.

  - **Seen in a browser:** a slow lookup ending in Sophiatown, one ending in
    "no delivery near you", and the wrapped "This can take a minute" on a
    narrow dark screen.
