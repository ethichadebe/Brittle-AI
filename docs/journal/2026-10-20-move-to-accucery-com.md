# 2026-10-20 — Moving the app to accucery.com

- **Asked for:** the owner registered accucery.com and wants the app there, instead of on its sub-domain of ethichadebe.me (#200).
- **What the move needs:** the address isn't in the code. It's in:
  - DNS at Hostinger;
  - the server's own nginx site and its certbot certificate;
  - `FRONTEND_URL` in the server's `.env`.
  - **Found by `scripts/check-domain.sh`**, a read-only check posted to #200 with every IP address masked. It showed accucery.com and www already pointing at the server, the app behind one certbot-managed nginx site, and ports 80 and 443 open.
- **Decided with the owner:** shoppers without an account keep their lists.
  - Such a shopper is known only by a cookie, and a cookie belongs to the address it was set on. Plain forwarding would leave them with empty lists at accucery.com.
  - **The handover:** the old address's `/api/handoff/send` makes a single-use code for the browser's id, expiring in 5 minutes. accucery.com's `/api/handoff/receive` swaps it for that id, once.
  - **Never replaces anything:** a browser signed in at the new address, or already holding lists there, keeps its own identity.
  - **Safe landing:** it lands on the page asked for, but never on another site.
  - **Old service worker removed:** the old address's service worker is replaced by one that removes itself, so a cached copy of the app can't keep running there.
- **`scripts/move-domain.sh`** does the server side, in an order that never leaves the app unreachable:
  1. Checks DNS and that the handover is deployed.
  2. Backs up the nginx site and `.env`.
  3. Gets the certificate.
  4. Serves accucery.com while the old address still works.
  5. Sets `FRONTEND_URL` and recreates the backend.
  6. Turns the old address into the handover. Its `/api/` keeps answering, so a webhook still pointed there isn't lost.
  7. Checks all three addresses.

  A failure after the certificate puts the backup back.
- **Worked first time:** mostly.
  - **Handover tests:** they break if any rule is removed: single use, own lists kept, signed-in kept, no other sites.
  - **Script test:** stubs nginx, certbot and docker, covering the move and each way it stops or restores.
  - **Real nginx:** the site the script writes passed a real nginx's config test, run against a stand-in app.
    - accucery.com served the app.
    - www forwarded with its path.
    - The old address's pages reached the handover with the page asked for.
    - Its `/sw.js` and `/api/` went where they should.
  - **One test check was wrong first time:** it read a cookie from the wrong response.
- **Laptop needed:** no. The owner ran the check from Hostinger's web terminal.
- **Friction:**
  - **Hostinger DNS:** adding the A record said "Domain not found" until "Reset DNS records" made the domain's zone. After that, the @ record was updated from Hostinger's parking address, and www already followed it.
  - **The session's container was replaced mid-task:** packages, Postgres's test user and gitleaks had to be set up again.
- **Still by hand after the move:**
  - **Paystack:** the webhook URL.
  - **AdSense:** accucery.com is a new site to add and have approved.
  - **Google Search Console:** a new property.
  - **Installed apps:** they keep opening the old address until added to the home screen again from accucery.com.
