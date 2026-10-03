# 2026-10-03 — Security headers, HTTPS-only cookies and rate limits

- **Asked for:** the first two production-readiness items, together:
  - **#153:** HTTPS-only cookies and browser security headers.
  - **#152:** limits on sign-in, sign-up, searching, location lookups and
    comparisons, so one person (or a script) can't guess passwords or burn
    the ScraperAPI credits.
- **What changed:**
  - **Headers.** Every response now says: don't put this site in a frame,
    don't guess file types, send less in the Referer, only this site may
    ask for location, and always use HTTPS. They live in one snippet,
    `nginx-security-headers.conf`, included in every nginx location that
    sets a header of its own, because nginx silently drops the outer ones
    there.
  - **Content Security Policy.** The build adds a `<meta>` policy to
    `index.html`: scripts and styles only from this site, plus the hashes
    of the two inline blocks (the splash). Anything injected is refused.
  - **Cookies** are `Secure` when `NODE_ENV=production`, which the compose
    file sets. Local development over plain HTTP still works.
  - **Limits**, in memory (one server, so no Redis):
    - sign-in: 10 tries per email, 30 per device, per 15 minutes;
    - sign-up: 5 per device per hour;
    - search: 30 a minute, 300 an hour per device. Past that, searches the
      app already has answers for still work; only new ones wait;
    - finding a list's branch: 10 per device per hour;
    - comparisons: 20 per account per hour.
  - A limited request gets a 429 with `Retry-After` and a plain message,
    e.g. "Too many searches. Try again in a minute.", which the app shows.
- **Worked first time:** mostly. One lint rule (`no-regex-spaces`) in the
  new nginx test. Checked with:
  - the real nginx serving the real build: every path, including `/api`,
    carries all six headers;
  - Chromium loading the home page, the splash, sign-in and New list: no
    policy violations. Tampering with the inline script made Chromium
    refuse it, so the policy really is enforced;
  - mutants: dropping `Secure`, any one limit, or the "cached answers
    still work" path each fails a test.
- **Laptop needed:** no.
- **Friction:**
  - `Secure` cookies would break sign-in on a plain-HTTP site, so this
    leans on the live site being HTTPS. It is: the app installs and uses
    location, and browsers allow neither without HTTPS.
  - Limits reset when the backend restarts (a deploy). Acceptable for one
    server; a shared store is only worth it with more than one.
