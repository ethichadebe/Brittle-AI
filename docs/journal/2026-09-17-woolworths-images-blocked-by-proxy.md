# 2026-09-17 — Woolworths search worked, every image was broken

- **Asked for:** Woolworths images not loading in the app, right after the live
  search started working.
- **Worked first time:** the fix did, because the URL was read rather than
  guessed. The bug itself is the third thing tonight that needed registering in
  a second file nobody remembered.
- **Laptop needed:** no. One `curl` against the app's own API on the VPS.
- **Friction:**
  - Images are proxied through `/image-proxy`, which only fetches hosts on an
    allowlist. That list had Checkers, Sixty60, Shoprite and Pick n Pay, so
    every Woolworths image returned `400 Invalid or disallowed image URL` and
    the browser drew a broken icon. Search worked, prices were right, and the
    store looked half-finished.
  - Two different faults produce exactly that symptom — a host that is not
    allowed, and a relative path that has no host at all — so the symptom could
    not decide between them. Asking the running app settled it in one line:
    `https://assets.woolworthsstatic.co.za/...`. Absolute, and on a different
    domain from the site, which is why nobody thought of it.
  - The probe had in fact never shown an image URL. Its "1st result values" dump
    skips any value longer than 40 characters, to keep the output readable on a
    phone, and image URLs are always longer than that. A readability cap quietly
    became a blind spot; worth remembering that a filter which hides long values
    hides URLs specifically.
  - The `Referer` was a ternary: Pick n Pay got its own, everything else got
    Checkers'. That is now a map from host to referer, so Woolworths images are
    fetched with a Woolworths referer. Shoprite deliberately keeps the Checkers
    referer it already had — it works, and changing a live store was not this
    fix's job.
  - `imageProxy.test.ts` walks `STORE_CONFIGS`, takes every store with
    `active: true`, and asserts a real image URL for it passes the allowlist. A
    fifth store now cannot be switched on with its images silently broken.
    Checked by mutation: removing the Woolworths host fails three tests and
    names the store.
  - The same test pins the suffix match against a look-alike domain —
    `woolworthsstatic.co.za.evil.com` must not be allowed — since an allowlist
    that matches on suffix is exactly where that goes wrong.
- **Pattern worth naming:** adding a store touches more than the scraper. It
  needs the engine registry, the Compose environment, and the image-proxy
  allowlist. Two of those three were missed tonight, both silent, both
  discovered in production. All three now have a test that fails when a live
  store is missing from them.
