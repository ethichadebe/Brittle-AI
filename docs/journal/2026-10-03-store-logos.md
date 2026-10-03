# 2026-10-03 — Store logos and brand-coloured progress bars

- **Asked for:** each store's logo in place of its name, and every progress
  bar in that store's logo colour, on the home page and the list page.
  Grilled:
  - **Makro:** its bar shows its logo's three colours as bands: blue, green,
    red.
  - **New list:** the store picker uses the logos too.
  - **Dark mode:** each logo sits on a small white tile, so dark logos keep
    their real colours.
- **Worked first time:** no. Two rounds of screenshots led to fixes:
  - Pick n Pay's navy bar was nearly invisible in dark mode.
  - The logos looked different sizes.
  - Woolworths was cut off in its New list tile.
- **Laptop needed:** no.
- **Friction:**

  - **The linked logos couldn't be fetched.** This session's network blocks
    those sites, and one link (Makro's) was Shoprite's. The owner attached
    the five images instead.

  - **Preparing them** in a headless browser, because no image tools are
    installed:
    - Each was trimmed to its edges.
    - White backgrounds were made transparent. Woolworths and Shoprite are
      single-colour, so each pixel became that ink at the right coverage,
      which keeps the edges clean on any background.
    - All were scaled to 72px tall, sharp at three times the largest size
      shown.
    - Makro's source is only 64px tall, which is still enough. They live in
      `frontend/public/stores/`.

  - **Colours** were read off the logos themselves:
    - Checkers #38a8b0, Shoprite #f43028, Pick n Pay #183858 (the "Pick"
      blue), Woolworths #181818.
    - Makro's bands are #00b0f0, #00b050 and #f03028.
    - The bands are laid across the whole bar and revealed as the list fills,
      so a quarter-done Makro list is all blue.

  - **Dark mode:**
    - Woolworths' black and Pick n Pay's navy would vanish on a dark track,
      so in dark mode those two bars turn light.
    - Every logo gets its white tile.

  - **Sizes:** logos fill their height differently, so each has a small
    scale factor to look the same size as the others. They are sized by
    maximum height, so they also shrink to fit a narrow tile.

  - **Checked in a browser,** light and dark: the home page with a list per
    store, a Makro list's header bar, and the New list picker. Screen
    readers still hear each store's name, from the logo's alt text.
