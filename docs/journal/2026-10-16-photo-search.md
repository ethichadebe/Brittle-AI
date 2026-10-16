# 2026-10-16 — Search with a photo

- **Asked for:** "take pictures of text or products and do a search from there".
- **Decided with the owner:**
  - **Claude reads the photo,** rather than text recognition on the phone, which can't read packaging or handwriting.
  - **Model: Claude Haiku 5.5.** It costs about R0.005 a photo; Opus 5.5 would be about R0.20.
  - **Signed-in shoppers only.**
  - **A list photo** shows each item it read as a chip to tap.
- **What changed:**
  - **Search screen:** a camera button beside the search box opens the phone's camera.
    - **On the phone:** the photo is shrunk to 1280 px JPEG before it's sent, about 70 to 300 KB instead of several MB.
    - **One item read:** it fills the search box and searches.
    - **Several items:** they show as chips, and the first is searched.
    - **Signed out:** the camera doesn't open; a "Sign in" link brings the shopper back to the list.
  - **Server:** `POST /search/photo` checks, in order:
    - signed in;
    - set up (`ANTHROPIC_API_KEY`);
    - store, file type and size;
    - the limit, 15 photos an hour and 60 a day per account.

    Only then does it ask Claude (`backend/src/photoSearch/reader.ts`). Claude answers in a fixed JSON shape, and the terms are trimmed, de-duplicated and capped at 10. A photo Claude declines reads as "nothing found". The photo is never stored or logged; a test sends one through a failing read and checks the logs don't contain it.
  - **Limits:** the rate limiter now keeps each key as long as the longest limit, so a daily limit survives its two-hourly clean-up. A test proves it, and fails against the old two-hour value.
  - **Hidden until set up:** with no key on the server, `GET /search/photo` says it's unavailable and the camera button isn't shown.
  - **Privacy notice:** names Anthropic, says photos aren't kept by us or used by Anthropic to train its AI, and is re-dated.
  - **New dependency:** `@anthropic-ai/sdk`, the official Anthropic client, in the backend.
- **Worked first time:** mostly.
  - Checked end to end in a browser against a stand-in for Anthropic's API, with the real SDK sending to it. The request carried Haiku 5.5, low effort, the JSON schema, the store's name and a 72 KB photo. The first item filled the search box, and tapping a chip switched to it. Signed out, the camera stayed closed and the sign-in link pointed back to the list.
  - Broken on purpose, each caught by a test: no sign-in check; the limit after the Claude call instead of before it.
  - The analytics event list is closed by design, so `photo_search` was added to it, with only the store attached.
- **Laptop needed:** no. The owner adds `ANTHROPIC_API_KEY` to the server's `.env` and compose file, and the camera appears.
- **Friction:** the shopping-trip test can't reach the stores from a cloud session, so the searches themselves said "No products found".
