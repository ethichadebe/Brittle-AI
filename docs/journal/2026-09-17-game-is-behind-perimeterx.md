# 2026-09-17 — The probe said "free to scrape" about a site it could not scrape

- **Asked for:** probe Game as the next store.
- **Worked first time:** the probe ran first time; its *verdict* was wrong, and
  it took two extra rounds to find out.
- **Laptop needed:** no.
- **Friction:**
  - **What Game actually is.** `/` and `/search` both return **21088 bytes —
    byte-identical**, so the server hands back the same shell whatever the
    route. No platform fingerprint matched. The only third-party hosts are
    Google Analytics, Tag Manager, Optimize, Maps and w3.org — no commerce
    infrastructure named at all. The visible text is `Browse Departments
    Services Sign In Detecting... Store locator ... Loading...`.
  - **The two strings that settled it:** `src="px/PXBIA59zcf/init.js"` and
    those two `Detecting...` labels. `px/PX<appid>/init.js` is the PerimeterX
    (HUMAN Security) sensor, and "Detecting..." is it running. Game is a
    client-rendered SPA whose API is gated behind a cookie that sensor mints.
  - **The probe called this "free to scrape directly".** `blocked()` asks
    whether *this response* was a challenge page — 403/429/202/503, or a small
    body containing `awswaf`, `incapsula`, `captcha`. PerimeterX trips none of
    them: it serves a clean 200 of real HTML and does its work in JavaScript
    afterwards. So a store we cannot reach without a browser was reported the
    same way Makro and Woolworths were, and "no WAF" was silently read as
    "cheap".
  - **The fix keeps the two ideas apart.** `blocked()` is unchanged and still
    answers "was this response a challenge". A new `botdefence()` answers a
    different question — "does this page carry a bot sensor" — and step [2] now
    says `-> HTML is free, but the API is likely gated behind that sensor.
    Needs a real browser.` instead of "free to scrape directly". Step [4] lists
    them beside the search platforms.
  - **Matched on shape, not on a vendor's name.** `perimeterx` as a bare word
    would miss the real page, which never spells it out — the evidence is the
    URL shape `px/PX<appid>/init.js` and the `_px3` cookie. A mutation that
    narrows the pattern to the vendor name fails three assertions, which is the
    only reason I know the pattern earns its place.
  - **`blocked()` is pinned in the same test.** It regressed once already, when
    Makro's 2.5MB homepage was called a WAF challenge because the word
    "captcha" appears in a page that big. The test now asserts a 200KB page
    carrying a reCAPTCHA widget is **not** blocked while `botdefence()` still
    names it, and that a small `awswaf` page and a bare 403 still are. Dropping
    the 50KB guard fails it.
  - **My Massmart hypothesis was wrong.** Walmart owns Massmart, which owns both
    Makro and Game, so I expected the Flipkart stack `makro.ts` already parses.
    Game shares none of it. Two for two on platform predictions being wrong
    today — the Makro image host was the other — which is the argument for the
    probes existing rather than an argument about my judgement.
  - **Recommendation recorded, not acted on.** Game now looks expensive
    (PerimeterX needs a real browser) and low-value (a general merchandiser;
    Makro's "Eggs" search returns plastic egg containers). Whether it is worth
    doing at all is the user's call, so this PR ships the probe correction only.
