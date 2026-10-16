# 2026-10-16 — The dashboard names shoppers like usernames

- **Asked for:** full emails on the dashboard, but "remove the @ and everything after that so that it looks like a username".
- **What changed:**
  - **Names:** the activity feed now names a shopper by their email before the @. `thandi.m@gmail.com` shows as `thandi.m` where it used to show `t***@gmail.com`. That applies to account made, sign-up waiting, Premium checkout, subscribed and renewed.
  - **Never a whole address:** the test now checks that the dashboard's whole answer contains no "@" at all.
  - **A trade-off, chosen by the owner:** an email's first part is often a person's name, so the dashboard is now a little more personal than before. It's still for the Owner's Account only, and still never shows a list's name or contents.
- **Worked first time:** yes. Switching back to whole addresses on purpose made the test fail.
- **Laptop needed:** no.
- **Friction:** none.
