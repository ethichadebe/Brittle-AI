# 2026-10-02 — Opening animation

- **Asked for:** an animation when the installed app opens. Three concepts
  were recorded as GIFs from real CSS; the owner chose "Draw" (the A draws
  itself, the tick checks in) and added a twist: the name starts blurred
  reading "Accuracy", and as it comes into focus it turns out to say
  "Accucery".
- **Worked first time:** yes. Two test expectations were wrong (the hidden
  letters make the raw text "Accuraccery"), and Chromium can't pretend to be
  an installed Android app, so the test poses as an installed iPhone app,
  which takes the same path.
- **Laptop needed:** no.
- **Friction:**

  - **The illusion is three letters.** "Accu-rac-y" and "Accu-cer-y" differ
    only in the middle, so those three are stacked and swap while the word
    is at its blurriest; the rest never moves.

  - **It lives in `index.html`, not React,** so it's on screen from the
    first frame while the app loads underneath, rather than adding a wait
    after loading.

  - **When it plays (grilled):** a fresh open of the installed app, once
    per app session, so switching back to it, or an update reload (#118),
    doesn't replay it. A tap skips it. Never when the phone is set to
    reduce motion. A browser tab doesn't get it. `?splash` on any address
    plays it, for seeing it without installing.

  - **Android's own splash comes first.** Android shows the icon on the
    manifest's background colour before any page code runs, and web apps
    can't animate that. The background is now teal, so the two read as one
    screen.

  - **Mutation-checked:** without the once-per-session check, it replays on
    reload, and the test fails.

## Follow-up, same day: the name becomes the home screen's title

- **Asked for:** replace "Lists" on the home screen with a teal "Accucery"
  whose "A" is the logo, and have the name move there from the opening
  animation.
- **What it does now:** the drawn A shrinks into the name as its first
  letter, "ccuracy" sharpens into "ccucery", and the whole wordmark glides
  up and turns teal as the background falls away, landing exactly on the
  home screen's new title (`components/Wordmark.tsx`). Opened straight onto
  some other screen, there's no title to land on, so it just fades.
- **Why it's now a script, not CSS alone:** where the title sits is only
  known once the page has rendered, so the moves are measured and played
  with the Web Animations API, in the same inline script.
- **The two marks must stay identical:** the splash's letter and the title
  share the `.wordmark-a` sizing and the same paths, or the landing jumps.
  Comments in both say so.
- **Mutation-checked:** if the title isn't un-hidden after the landing,
  the home screen would have no title, and the test fails.
