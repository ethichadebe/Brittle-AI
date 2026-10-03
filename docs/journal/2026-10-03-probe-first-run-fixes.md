# 2026-10-03 — What the location probe's first real run taught it (#66)

- **Asked for:** nothing new. The first full run on the server (posted on
  #66) reached every site but got no prices.
- **Worked first time:** no. That run is why this change exists. Each of
  its three failures is now in the offline test, and I broke each fix on
  purpose to check the test catches it.
- **Laptop needed:** no.
- **Friction:**

  - **Checkers and Shoprite: every page refused its certificate.** The
    probe sent a browser through ScraperAPI's proxy port, which re-signs
    HTTPS with ScraperAPI's own certificate. Chromium rejects that.
    - The scrapers never had this problem because they use ScraperAPI's
      API endpoint with plain requests and no browser. The probe now does
      the same.
    - The stand-in ScraperAPI checks that the key is sent and that only the
      store's own API URLs are requested. It also checks the key is never
      printed.
    - **Still unproven:** production only ever sends the product search
      this way. Whether the branch lookup also gets through ScraperAPI is
      what the next run shows.

  - **Pick n Pay: every address was refused (HTTP 400).**
    - The probe sent an empty street. The recorded browser session had a
      real one.
    - Each place now gives the town's main road, which is a public street,
      not anyone's address. The coordinates are what pick the store.
    - The stand-in now refuses an address without a street, as the real
      site does.

  - **The 400 said only `{`.** Pick n Pay indents its error replies, and
    the probe kept only their first line. It now flattens the whole reply
    onto one line. It also names the step that failed: branch, address,
    store or search.

  - **Pick n Pay's page never goes quiet.** Waiting for the network to
    settle cost 45 s and then timed out. The probe now only waits for the
    page to load. The stand-in page polls forever, as the real one does.
