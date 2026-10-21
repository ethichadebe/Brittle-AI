# 2026-10-21 — The old address says "moved for good"

- **Asked for:**
  - Google still lists accucery.ethichadebe.me for "accucery". The owner asked whether to kill the old address so the new one shows.
- **Answer:** no. Killing it breaks the listed link, and doesn't make Google list the new one. Instead:
  - The old address now forwards with **301 (moved permanently)** wherever there's nothing to hand over. That covers every crawler, since they carry no cookie. Until now every forward was a 302 (temporary), which tells Google to keep the old address.
  - A shopper whose lists are being handed over still gets a 302: the code in it is single-use, never something to remember.
  - Next, the owner uses Search Console's **Change of address** from the old site to accucery.com.
- **Also:** `scripts/move-domain.sh` now waits two seconds after each nginx reload before checking anything.
  - Its one "CHECK" line on the real move was this race. The old address was checked a moment before the reload took effect.
  - Checked from outside afterwards, it forwarded as it should.
- **Worked first time:** yes. The test fails if the forward goes back to 302.
- **Laptop needed:** no.
- **Friction:** the session's container lost Postgres again. Restarting it was enough.
