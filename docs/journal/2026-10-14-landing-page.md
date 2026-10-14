# 2026-10-14 — A landing page for newcomers, with a way into the app

- **Asked for:** a landing page like Listonic's, with a button that takes you into the app.
- **Decided with the owner:** it lives at `/` for newcomers. Anyone already using Accucery (signed in, or with lists) and the installed app go straight to their lists, as before, so no link, bookmark or installed app changes.
- **What changed:**
  - **The page, laid out like Listonic's:**
    - a hero with an example list in a phone and the "Start my list" button;
    - the six store logos;
    - six feature cards;
    - three sections (spend less, see where it's cheaper, shop faster);
    - how it works;
    - questions;
    - a closing button;
    - a footer with Privacy and Terms.
  - **Light and dark,** from the app's own colour tokens. It uses the whole screen; the app stays phone-width.
  - **In a browser, it replaces the intro slides** for a first visit. The installed app keeps the slides.
  - **"Start my list"** opens a new list, and **"Open app"** opens the empty home. Either way it's remembered on that device (the intro's own flag), so it isn't shown again.
  - **`/welcome`** shows the page to anyone, for sharing it and for seeing it again.
  - **Link previews:** title and description tags. There's no image tag, since that needs the site's full address, which stays out of this repo.
  - **Every claim on the page is something the app does today.** Store names and loyalty cards come from `STORE_CONFIGS`, so they stay right as stores are added. Premium isn't mentioned until it has a perk.
- **Worked first time:** mostly. Driving it in Chromium (phone and desktop, light and dark) showed:
  - "Open app" not at the right edge on phones;
  - the app's `.btn` rule squaring the round buttons;
  - Clicks wrapping onto a second line;
  - the "cheaper" badge hiding an item in the example list;
  - two white sections running together;
  - the phone's black edge disappearing in dark mode.
  
  All are fixed. The flows checked out: a newcomer gets the page; after either button they don't get it again; someone with lists never sees it; nothing scrolls sideways at 360px.
- **Laptop needed:** no.
- **Friction:** none beyond the one question of where the page should live.
