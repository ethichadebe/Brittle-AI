# 2026-10-22 — Keeping the data that passes through the app

- **Asked for:** a data collection stream, since a lot of useful data passes through the app.
- **Decided with the owner:**
  - **What:** price history, searches, comparison results, and each shopper's shopping history.
  - **What for:** just start keeping it; features come later. History can't be collected backwards.
  - **Shopping history:** on by default with a switch to turn it off; every device, not only accounts; items added and ticked off.
  - **Device name:** browsers don't share the name a person gave their phone. The closest is the model Chrome on Android sends when asked (e.g. "SM-A546E"); iPhones and computers give only a platform.
- **What changed:**
  - **Five new tables** (`docs/data-collection.md`), one migration, written by `backend/src/services/collect.ts`.
    - `price_history`: one row per product, store, zone and day. Before this, every new price overwrote the last.
    - `search_log` and `compare_log`: not linked to anyone.
    - `shopping_events` and `history_opt_outs`: the shopper's own history and their switch.
  - **A failed write never breaks the app:** it's logged and swallowed.
  - **Profile:** a "Keep my shopping history" switch. Turning it off asks first, then deletes the history and stops it.
  - **Sign-in** moves a device's history to the Account. **Deleting the Account** deletes it.
  - **nginx** asks Chrome for the phone model (`Accept-CH`).
  - **Privacy notice:** says what's kept, why, and how to turn it off.
- **Worked first time:** yes. The new tests (11, plus one in the compare test) all passed. Removing each piece of wiring in turn made a test fail.
- **Laptop needed:** no.
