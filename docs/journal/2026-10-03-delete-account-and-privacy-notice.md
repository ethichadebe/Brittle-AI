# 2026-10-03 — Delete my account, and a privacy notice

- **Asked for:** the next two production-readiness items, together:
  - **#151:** delete my account, confirmed with the password, everything
    gone at once.
  - **#150:** a privacy notice (POPIA) and a short price disclaimer.
- **What changed:**
  - **Delete account**, on Profile. A sheet says what goes and asks for
    the password. The account, its lists and items, its sessions and its
    substitute picks are deleted in one transaction. The device is signed
    out and given a fresh anonymous identity, so it starts empty.
    - Wrong passwords count against the sign-in limit (#152), so this
      isn't a way around it.
    - The test searches **every table in the database** for the account's
      id, email, list, item and session afterwards. A table added later is
      covered without touching the test.
    - Popular Substitutes are counted from people's picks each time, so
      once the picks are gone nothing of the account remains in them.
  - **Privacy notice** at `/privacy`, open to anyone, linked from Profile
    and from the sign-up screen. It names the owner and
    `privacy@ethichadebe.me`.
  - **Disclaimer** (prices are a guide; not connected to the stores; logos
    belong to them) on Profile, at the bottom of compare results, and in
    the notice.
  - **A test keeps the notice honest.** It fails if:
    - the cookie lengths it gives stop matching the code;
    - the database gains a coordinates column;
    - the backend uses ScraperAPI or Resend without the notice naming it,
      so #147 can't add email without updating the notice;
    - the owner's name is still a placeholder.
- **Worked first time:** mostly.
  - The route list didn't know `/privacy` until Vite regenerated it.
  - A word in a schema comment tripped the coordinates check, so it now
    reads fields only.
  - Every check above was mutation-tested, and each screen was looked at in
    Chromium, in light and dark.
- **Laptop needed:** no.
- **Friction:**
  - The owner's name had to be asked for twice: picking "type my name" in
    the question didn't carry the name itself.
  - **Resend isn't named yet**, because nothing sends email yet. #147 adds
    it, and the test above makes that impossible to forget.
  - **The host's logs.** The notice says the server logs IP addresses and
    clears them regularly. The app's own containers never see a shopper's
    IP: the server's nginx in front does, and on a stock server it rotates
    its logs. That nginx isn't visible from here.
