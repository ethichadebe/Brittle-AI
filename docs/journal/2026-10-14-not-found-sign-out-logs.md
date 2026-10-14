# 2026-10-14 — A 404 page, robots.txt, clean sign-out, no email in logs

- **Asked for:** the rest of the production-readiness list: a 404 page with robots.txt and a sitemap, the POPIA log test (#88), and a clean sign-out (#87).
- **What changed:**
  - **404 page.** An unknown address showed the router's bare "Not Found". It now shows the app's own page, with links to the lists and to the landing page.
  - **robots.txt and sitemap.xml.** Served by the backend, because a sitemap needs full addresses and the app's address is a server setting (`FRONTEND_URL`), never in the repo. The frontend's nginx sends just those two paths to the backend.
    - The sitemap lists the landing page, privacy and terms. Everyone's own pages are kept out of search.
    - A test makes every new page either listed or kept out, so none is forgotten.
  - **Sign-out (#87).** It ended the session but kept the device's anonymous id. On a shared phone, a list left on the device when the Account signed in (a name clash, which #85 leaves alone) came back for the next person. Signing out now gives the device a new identity with nothing behind it. A test plays the shared phone through: a stranger's lists, sign in, sign out, nothing left, sign back in, everything there.
  - **No email in logs (#88).** The app's own messages already masked addresses. But an error from elsewhere could carry one, such as Resend or Paystack quoting the address back, or an address in a URL. Now every line is masked on its way out, from the logger and from `console`. A test runs each path that handles an address and finds none in full.
- **Worked first time:** mostly.
  - The first log test passed even with the `console` masking removed, because no flow in it sent a raw address through `console`. A Paystack refusal that quotes the address now does, and removing either half of the masking fails the test.
  - Also broken on purpose: the 404 wiring, and sign-out without the new identity. The tests failed both times.
  - One test typing error, caught by the typecheck.
- **Laptop needed:** no. Nothing to do on the server: the new nginx lines ship in the frontend image.
- **Friction:** none.
