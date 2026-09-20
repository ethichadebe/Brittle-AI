import { defineConfig } from "vitest/config";

// The pure suite: everything that needs no Postgres.
//
// It deliberately sets no `globalSetup`, no `setupFiles` and no `DATABASE_URL`.
// That is the point of the split — the old single config opened a Prisma
// connection in `globalSetup` before any test ran, so a scraper parsing test
// could not run without a database. Leaving the URL unset also keeps the suite
// honest: a test that reaches for the real client here fails loudly instead of
// quietly talking to whatever database happens to be on localhost.
//
// A test that needs the database is named `*.db.test.ts` and runs from
// `vitest.db.config.ts` instead.
export default defineConfig({
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.db.test.ts"],
  },
});
