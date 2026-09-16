# 2026-09-16 — Add a real linter

- **Asked for:** add the linter, so the `lint` slot in CI stops being a typecheck wearing a lint costume.
- **Worked first time:** yes, and more easily than expected. A sensible baseline — `@eslint/js` recommended, `typescript-eslint` recommended, `react-hooks` on the frontend — produced **7 errors across 4 files**, not the hundreds that adding a linter to an untouched codebase usually means. Small enough that the "start strict or start loose" question answered itself: start strict, fix what it finds, ship green.
- **Laptop needed:** no.
- **Friction:**
  - The codebase already had `eslint-disable` comments in it — `@typescript-eslint/no-explicit-any` in three scrapers, `react-hooks/exhaustive-deps` in a hook, a blanket disable atop the generated route tree — written for a linter nobody had installed. They were dead text. Picking the rule sets the code already assumed was less a decision than a reading.
  - Five of the seven were `any` in the Pick n Pay and Checkers scrapers, where untyped third-party JSON genuinely arrives. They got inline disables matching the convention already in those files, rather than switching the rule off for the directory — a blanket override would wave through the next careless `any` too. Typing those responses properly is worth doing and is not this change.
  - The other two are `react-hooks/set-state-in-effect`, and they are **real findings**, not noise: an effect in `useAnimatedMount` and the debounced search in the list route both call `setState` synchronously, which cascades renders. Fixing either means changing how the animation or the search behaves, with no test covering either, so both are marked with a reason saying exactly that. The rule stays an error, so a third one cannot appear quietly.
  - `eslint@9` installs and immediately warns it is out of support; 10 is current. Worth checking rather than accepting what a version range resolves to.
  - Swapping the `lint` slot from `typecheck` to ESLint does not lose typechecking: every Target's `build` runs `tsc`, so a type error still fails its job. Said in the workflow comment so nobody re-adds it thinking there is a hole.
  - Checked the linter can actually fail before trusting it green — planted a file with an `any` and an unused variable, confirmed two errors and exit 1, removed it. A check nobody has seen fail is not a check.
