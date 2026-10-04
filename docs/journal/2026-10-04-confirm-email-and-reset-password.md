# 2026-10-04 — Confirm email at sign-up, reset a forgotten password

- **Asked for:** #148 and #149 together, after #147's test email landed in
  the inbox. Grilled, with the owner:
  - **Emails look like Accucery:** a branded card (teal band and logo, one
    big button, small footer), not a landing page, which would be heavier
    and likelier to land in Promotions or spam. Each one also carries a
    plain-text copy.
  - **Built together with #148 and #149**, so the design is made once. A
    preview of the three emails was sent before the PR.
- **What changed:**
  - **Sign-up emails a link (#148).** No account exists until it's opened.
    Signing up again sends a new one, and only the newest works. A link
    works once and expires after 24 hours.
  - **An email that already has an account** gets the same answer on
    screen, and its owner gets a "you already have an account" email
    instead. So sign-up never says which emails have accounts.
  - **The confirm page asks for one tap** rather than confirming on load:
    mail apps and virus scanners open links by themselves, and would spend
    the link before the shopper.
  - **Forgot password (#149):** a link from the sign-in screen. The answer
    is the same whether or not there's an account. The link works once and
    expires in an hour. Saving a new password signs out every session; the
    shopper then signs in, which brings this device's lists across as
    usual.
  - **Only a hash of each link is stored**, never the link or a password.
    Pages wipe the token from the address bar once they've read it.
  - **Expired sign-ups and reset links are deleted hourly.** The privacy
    notice says so, and a test holds it to that.
  - **Links are built from `FRONTEND_URL`, never from the request**, which
    could name any site. In production it must start with `https://`, or
    the server won't start.
  - **Limits:** 3 emails per address per hour, shared by sign-up and reset.
    10 reset requests per device per hour.
  - **Tests:** the existing ones that needed an account now go through the
    real sign-up and confirm path, via one helper.
- **Worked first time:** mostly.
  - One test assumed reset had its own email allowance. It shares one with
    sign-up, by design, and the test now says so.
  - Postgres stopped twice in this session and was restarted.
  - Every screen was driven in Chromium; the new checks were
    mutation-tested.
- **Laptop needed:** no.
- **Friction:**
  - **Only the owner can see real email.** This session can't reach
    Resend, so the emails were checked by rendering them here, and are
    tested live by signing up.
  - **On a phone, the email link often opens in a different browser** than
    the installed app. The account is still made, and the "check your
    email" screen now says to come back and sign in.
