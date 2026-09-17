# 2026-09-17 — The probe called a 2.5MB homepage a WAF challenge

- **Asked for:** probe Makro, after two earlier rounds of probe fixes.
- **Worked first time:** no. Three separate wrong diagnoses before the real one,
  each of which looked plausible and was cheap to test.
- **Laptop needed:** no.
- **Friction:**
  - `blocked()` decides whether a response is a WAF challenge. It checks the
    status code, and then greps the body for `awswaf`, `incapsula`, `captcha`,
    `Request unsuccessful` and `Access Denied`. Makro's real homepage is
    **2.5MB**, and somewhere in it the word `captcha` appears — a login form's
    reCAPTCHA is enough. So a perfectly good page, already fetched and already
    paid for with a credit, was classified as blocked and thrown away.
  - The discriminator I should have used from the start: **a challenge page is
    small and a storefront is not.** The body scan now applies only under 50KB.
    Status codes still apply at any size, so a 403 is still a 403.
  - Verified both directions on a stub: a 2.5MB page containing
    `recaptcha/api.js` is no longer blocked and its fingerprint runs, while the
    small `awswaf` challenge page at step [2] is still correctly reported as a
    WAF. Getting only the first of those right would have broken WAF detection
    for Checkers and Shoprite.
  - **Three wrong diagnoses, in order.** First: the credit cap was truncating
    discovery — disproved by a rerun that spent 3 of 8. Second: the homepage was
    being discarded — true and worth fixing, but not why the fingerprint failed.
    Third, and actual: a false positive in the WAF detector was rejecting that
    homepage. Each guess was cheap to test, which is the only reason being wrong
    twice cost minutes instead of a rewrite. Saying "rerun with a bigger cap"
    with confidence was the part worth avoiding.
  - Worth keeping in view: this was only ever visible because the probe prints
    what it did at each step. A scraper that silently returned nothing would
    have taken far longer to unpick.
