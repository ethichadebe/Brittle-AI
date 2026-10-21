# 2026-10-21 — One search result for the landing page, and a fuller description

- **Asked for:**
  - Google listed accucery.com under the short page description, "Your grocery list with live store prices, and where it's cheaper."
  - The owner asked why it didn't use the landing page, which also lives at /welcome. They proposed sending newcomers from / to /welcome.
- **Advised against the redirect, and the owner agreed.**
  - A first visit to / already shows the landing page, so Google reads it there.
  - Redirecting would move the result to accucery.com/welcome, off the address search engines rank most strongly. The short text was Google showing the description it starts with on a newly found site.
- **What changed instead:**
  - **The page description** names all six stores and is under 160 characters, so a result can show it whole. A test checks both.
  - **/welcome says it's the same page as /**, with a canonical `Link` header from the app's nginx. A header rather than a tag, because index.html is one file served for every address:
    - a `map` on `$request_uri` (the address asked for, even once served as index.html) sets it only for /welcome;
    - the index.html location sends it, and sends nothing elsewhere.
  - **The sitemap drops /welcome.** It stays open to crawlers, so they can read the header. `SAME_AS` in crawlers.ts records it, and the sitemap test now allows a page to be listed, the same as a listed one, or kept out.
- **Worked first time:** yes.
  - The app's real nginx config ran locally against the built app.
  - /welcome, /welcome/ and /welcome?x=1 got the header. /, /privacy, /welcomex and /lists/abc didn't.
  - The share card's addresses were still filled in on every page.
- **Laptop needed:** no.
- **Friction:** none.
