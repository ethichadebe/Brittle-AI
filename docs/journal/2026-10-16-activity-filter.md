# 2026-10-16 — A filter on the dashboard's Latest activity

- **Asked for:** "a filter to the latest activity". The owner chose type and username, over type only or type, username and time.
- **What changed:**
  - **Type buttons:** All, Accounts, Sign-ups, Lists and Premium, where Premium gathers checkouts, subscriptions and renewals.
  - **Username box:** finds any part of a username, in any case. Tapping a name in the feed fills it in, to see that one shopper's activity. "Show all" clears both.
  - **Count:** a line says how many events match, and the feed shows the latest 50 of them.
  - **History per kind:** the server now sends up to 50 of each kind instead of 50 in total. Otherwise a busy kind (lists) crowds out an older Premium event, and filtering to Premium would show almost nothing. A test proves it: 60 lists still leave the older checkout in.
  - **Lists name their maker:** a list on an Account now says whose ("thandi.m made a list at Checkers"). Never its name or what's on it. A list without an Account still has no name.
- **Worked first time:** yes. Checked against the sample database in a browser: All showed "The latest 50 of 113", Premium 15, "thandi" 14, and tapping a name narrowed to that shopper.
- **Laptop needed:** no.
- **Friction:** the local test database had stopped, and its first run printed nothing until it was restarted.
