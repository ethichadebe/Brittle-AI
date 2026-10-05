# 2026-10-05 — Google Analytics

- **Asked for:** Google Analytics, before sharing the app. Grilled:
  - **Consent:** always on, explained in the privacy notice (the owner's
    choice; asking first was offered as the POPIA-safer option).
  - **What's measured:** page views, plus five actions: list created, item
    added, price comparison run, location used, sign-up confirmed.
  - **Setup:** the owner had no GA property yet; walked through it step by
    step.
- **What changed:**
  - `src/lib/analytics.ts` loads Google's script and sends one page view per
    screen.
  - **Every address is cleaned first:**
    - list ids become `:id`;
    - nothing after `?` or `#` is sent, so a confirm or reset link's token
      never reaches Google.
    A browser check with a token in the address found it nowhere in what
    was sent.
  - **Actions carry store names only.** Anything else a caller passes is
    dropped, and a test proves it.
  - **Advertising features are off:** no Google signals, no ad
    personalisation.
  - **The page's security policy opens to Google only while a Measurement ID
    is set.** With none, the built page doesn't mention Google at all.
  - **The privacy notice** names Google Analytics, what it sees and doesn't,
    the 2-month retention, and that an ad blocker turns it off. A test fails
    if an ID is set and the notice still says otherwise.
  - **Dashboard setting:** Google's own "enhanced measurement" is switched
    off in the dashboard. It would send page addresses itself, outside this
    cleaning.
- **Worked first time:** yes. Checked in Chromium with a stand-in for
  Google's script: one page view per screen, the right events, no token, no
  policy errors.
- **Laptop needed:** no.
- **Friction:** the Measurement ID only exists once the owner creates the
  property, so the PR waited for it.
