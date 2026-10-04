# 2026-10-04 — Send email through Resend

- **Asked for:** #147, the first of the three email issues. Grilled:
  - **Split:** #147 alone first, so a test email is seen to land in the
    inbox before sign-up depends on it; #148 and #149 together after.
  - **Sender:** `Accucery <noreply@ethichadebe.me>`, with replies going to
    `privacy@`, so a reply still reaches the owner.
  - **Resend** wasn't set up yet: the PR carries the owner's steps.
- **What changed:**
  - `backend/src/mail/mailer.ts`: one POST to Resend's API, no new
    dependency. Addresses are logged masked (`t***@example.com`); the key
    only ever sits in the Authorization header.
  - Plain-text emails with a short branded header and footer.
  - `node dist/mail/sendTest.js you@example.com` sends one test email from
    the server and prints Resend's id, or exactly why it refused.
  - In production the server **won't start without `RESEND_API_KEY`**. A
    deploy without it is turned away by the candidate check, so the live
    site stays as it was rather than shipping without email.
  - `RESEND_API_KEY` and `MAIL_FROM` are wired through the compose file and
    documented in `.env.example`.
  - The privacy notice names Resend. The test from #150 demanded it the
    moment the code called Resend, which is what it was for.
- **Worked first time:** mostly.
  - Starting the real server in a test failed on the shared types
    package's module loading (a known local quirk), so the test reads the
    entry file and checks the key check comes before the server listens.
  - Each test was mutation-checked.
- **Laptop needed:** no.
- **Friction:**
  - **This session can't reach Resend at all:** the network blocks
    `api.resend.com`. So nothing here has sent a real email; the owner's
    test email from the server is the first.
  - **The compose file isn't deployed.** The deploy sends only new images
    to the server, so the two new settings need the server's copy of
    `docker-compose.prod.yml` updated by hand, once, before merging. The
    PR says how.
  - Gitleaks was installed locally this time, so the secrets check ran
    here before CI.
