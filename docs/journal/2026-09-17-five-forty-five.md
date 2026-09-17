# 2026-09-17 — Five, then forty, then five again

- **Asked for:** finish characterising Makro.
- **Worked first time:** no, and I gave three different answers to the same
  question before checking what the numbers meant.
- **Laptop needed:** no. Free, no credits.
- **The three readings, and what each was actually measuring:**
  1. **"Five products."** From the two top-scoring arrays. Those are two widgets
     among many, so it measured one corner of the page.
  2. **"Forty products."** From counting distinct `productId` strings anywhere in
     the embedded data. Ids appear in tracking payloads, wishlist actions and
     impression lists, so it counted mentions, not products. I announced this as
     a correction to (1) and changed a recommendation on it.
  3. **"Five usable."** From the parser simulation — objects carrying an id, a
     title *and* a pricing block. That is the only one of the three that
     measures what a scraper can actually turn into a `Product`.
  Three numbers, three definitions, and I treated them as successive
  corrections of one fact rather than as answers to different questions.
- **What is solid:** the extracted prices are right. `R215.00 was R329.00`
  matches step [6] exactly, and `R18.95` and `R97.95 was R109.95` are plausible
  shelf prices. The parser logic works; only the yield is in question.
- **Two limits that could hide products, now ruled out rather than assumed:**
  - The walker stopped at depth 16 and the id counter at 14. Flipkart nests
    hard, and a shallow limit proves nothing about absence. Both are 40 now.
  - It accepted a title only at `title`. The live page showed `value.title` in
    the `renderableComponents` widget, but the `products` widget nests it at
    `titles.title`, so an entire widget shape was invisible.
  On a fixture with five shape-A products and thirty-five shape-B products
  buried twenty levels deep, the old code found five and the new finds forty.
  **That proves the limits could hide products, not that the live page has
  them.** The live run decides, and this note is being written before it.
