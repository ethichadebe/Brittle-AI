# 2026-10-03 — Why some product pictures don't load (#139)

- **Asked for:** look into the broken pictures in the owner's screenshot of a
  Checkers search: the first five load, most of the rest don't.
- **Worked first time:** the probe's offline test passed first time. I then
  broke the probe twice on purpose, and the test caught both. Not yet run
  live.
- **Laptop needed:** no.
- **Friction:**

  - **Not the allow-list.** Every Checkers and Shoprite picture in the
    2026-10-02 browser recordings (738 products) comes from
    `catalog.sixty60.co.za`, which the image proxy already allows.

  - **Three possible causes:**
    - a refusal from the image server;
    - a limit on how many pictures it serves at once;
    - the proxy's own request being refused.

    The "first few load" pattern suggests the second, but this session
    can't reach the server to see.

  - **`scripts/probe-images.mjs`** asks the running app inside the backend
    container for the search and then its pictures, two ways:
    - one at a time, through the proxy and straight from the image server;
    - all at once through the proxy.

    It prints each status and says which cause it is.

  - **The stand-ins** are an app and an image server that fail in each of
    those three ways, plus one that doesn't fail. They are invented: which
    failure the live server has is what the run is for.
