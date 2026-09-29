# 2026-09-29 — The first backend route to need a real value from `@accucery/types`

- **Asked for:** nothing — the #99 deploy failed, and the user reported it
  directly.
- **Worked first time:** no. The fix itself worked first try once
  diagnosed; getting to the diagnosis took reading the actual container
  logs rather than guessing.
- **Laptop needed:** yes — the deploy dispatcher's migration/candidate
  check only runs on the VPS, and its failure logs (the actual root cause)
  only exist there.
- **Friction:**

  - **The error was plain once I stopped assuming it was another zone
    issue.** `Error [ERR_MODULE_NOT_FOUND]: Cannot find package
    '@accucery/types' imported from /app/dist/routes/compare.js`. The
    backend Dockerfile's comment said exactly why this had never happened
    before: "All `@accucery/types` imports in the backend are `import
    type` — erased at compile time — so the dangling workspace symlink
    causes no runtime errors." `compare.ts` imports `STORE_CONFIGS` as a
    real value, to validate a target store — the first backend code ever
    to need one. `tsc` correctly kept that import in the compiled output;
    the runner image was never built to have anywhere for it to resolve
    to, because nothing needed that before.

  - **Reproduced before touching anything.** Rather than trust the
    Dockerfile comment's reasoning secondhand, broke it directly: renamed
    the real `node_modules/@accucery/types` workspace symlink to simulate
    what the runner image already has (a dangling one, since
    `packages/types` itself is never copied into that stage), and ran the
    actual compiled `dist/routes/compare.js` against it. Same error,
    verbatim. Then built the fix's exact layout — `packages/types`'s
    compiled `dist/` plus a minimal standalone `package.json` — in the
    symlink's place, and confirmed both the single route and the whole
    `dist/app.js` module graph load clean. Restored the real symlink
    immediately after; no Docker daemon was available in this session to
    verify by actually building the image, so this was the fixture built
    instead.

  - **The fix stays local to the Docker image, on purpose.** The obvious
    alternative — adding an `exports` map to `packages/types/package.json`
    pointing Node at compiled output — would also change what `main`
    resolves to for Vite and `tsc`, both of which currently read straight
    from `./src/index.ts` with no build step required. Touching that
    risks slower or broken frontend dev for every future session, to fix
    a problem that is really the runner image's alone. So the source
    package's own `package.json` is untouched; the Dockerfile now builds
    `packages/types`, and writes a second, throwaway `package.json` (just
    `"main": "./dist/index.js"`) directly into the runner image's
    `node_modules/@accucery/types`, replacing the dangling symlink with
    real, loadable content.

  - **Next:** nothing pending — this was a deploy fix, not new product
    work. Once merged and deployed, PR #99's compare feature should come
    up clean.
