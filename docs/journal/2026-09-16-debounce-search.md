# 2026-09-16 — Checkers search wasn't broken, it was six searches

- **Asked for:** the app is live, but Checkers search never returns while Pick n Pay is fine.
- **Worked first time:** yes, once the cause was measured rather than guessed. Three things combined, none of them wrong on its own.
- **Laptop needed:** no. The counting was done by driving the real UI in a browser and watching the network, which is the only place this bug is visible — every API-level test passes, because a single request has never been the problem.
- **Friction:**
  - The search effect fires on every change to `query`, so typing a six-letter word dispatched six searches. The `AbortController` looked like it handled that, but `api.search` never took a signal — `abort()` cancelled nothing and only gated the `setState` calls. Meanwhile the backend's `withStoreQueue` runs one scrape at a time per store, so all six queued behind each other and the UI waited on the last.
  - Measured on the VPS: one Checkers request 2.891s, six at once 18.648s. A ratio of 6.45 — the queue serialising perfectly. Pick n Pay is under a second per request, so the same six cost under six seconds and nobody noticed.
  - So "Checkers search is broken" was really "Checkers search takes nineteen seconds", and the UI says only "Searching…" either way. A spinner that cannot distinguish slow from broken will be read as broken every time.
  - Debouncing 350ms takes it to one request. Counted by driving the UI in a browser and watching the network: six keystrokes produced six requests before, one after, and the one is the whole word rather than a prefix.
  - The abort signal is now actually threaded through to `fetch`, so a superseded request stops occupying the queue instead of merely having its result discarded.
  - Moving the `setState` calls inside the debounce timer also resolved one of the two `react-hooks/set-state-in-effect` findings marked in #16 — the `eslint-disable` is deleted, not relocated, and the rule stays silent. The `useAnimatedMount` one is untouched and still marked.
