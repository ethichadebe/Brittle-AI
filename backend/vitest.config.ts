import { defineConfig } from "vitest/config";

// `npm run test -w backend` runs both suites, so a new test file is never
// silently skipped locally. CI runs them as two separate jobs — see
// `.github/workflows/ci.yml` — because only one of them needs a Postgres
// service, and the pure suite should still report when the database job cannot
// start.
export default defineConfig({
  test: {
    projects: ["./vitest.unit.config.ts", "./vitest.db.config.ts"],
  },
});
