# 2026-10-01 — Redesign 1/9: home screen and the new look

- **Asked for:** #110, the first slice of the redesign grilled today: a teal
  look in light and dark, and a home screen of your lists instead of stores.
- **Worked first time:** nearly. A browser check caught two things before
  the PR: a swipe that started on the ⋮ button opened the list instead, and
  the red Delete button showed through each card's rounded corners.
- **Laptop needed:** no.
- **Friction:**

  - **Dark mode couldn't stop at the home screen.** Every other screen had
    white hard-coded, so turning dark on for one screen would have left
    light text on white elsewhere. The whole stylesheet now runs on colour
    tokens (`index.css`, top), and the screens this slice doesn't redesign
    were checked in dark too. That's most of the diff's size.

  - **The New list button needed somewhere to go.** It used to hang off
    each store's card, and those are gone. Until #111 builds the real
    new-list screen, it opens the old dialog with a row of stores to pick
    from, defaulting to the store of your newest list.

  - **Delete waits five seconds.** The list leaves the screen at once with
    UNDO; the server is only asked to delete it when the bar goes, or
    sooner if you open another list or delete a second one. If the server
    refuses, the list comes back rather than quietly disappearing.

  - **One new dependency: the Inter font,** bundled into the app so no
    phone ever asks Google's servers for it.

  - **Backend:** the lists come with how many items are ticked (for the
    progress bar), and a list can be renamed (`PATCH /lists/:id`, only by
    whoever owns it).

  - **Mutation-checked:** putting an undone list back at the end, skipping
    the Appearance setting on load, and letting UNDO's timer still fire
    each fail the check meant for them. Swipe was checked with real touch
    events as well as a mouse, and a vertical drag still scrolls.

  - **Next:** #111, the new-list screen.
