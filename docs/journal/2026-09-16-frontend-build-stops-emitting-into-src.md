# 2026-09-16 — Stop the frontend build emitting into src/

- **Asked for:** fix the trap noted during onboarding — `npm run build -w frontend` scattering compiled `.js` files next to the sources.
- **Worked first time:** yes. `frontend/package.json` runs `tsc && vite build`, but `frontend/tsconfig.json` set neither `noEmit` nor `outDir`, so the `tsc` half emitted thirteen `.js` files into `frontend/src/` before Vite did the actual bundling. Adding `"noEmit": true` makes that first half a typecheck, which is all it was ever meant to be. Vite still produces `dist/` exactly as before.
- **Laptop needed:** no.
- **Friction:**
  - The emitted files were untracked and not gitignored, so a local build left thirteen files in `git status` waiting to be committed by accident — and Vite then warned about duplicate route files, because the TanStack router generator saw both `routes/index.tsx` and the emitted `routes/index.js`.
  - CI never noticed, since every run starts from a fresh checkout and throws the artifacts away. It only bit people running the checks locally, which `CLAUDE.md` now asks everyone to do before opening a PR — so onboarding made a latent annoyance into a real one.
  - Anyone who ran the frontend build before this change still has the thirteen files in their working copy. They are not removed by this change and need deleting by hand once.
  - `backend` and `packages/types` both set `outDir` and are meant to emit, so neither was touched.
