import { defineConfig } from "vitest/config";

// The database suite: `*.db.test.ts`, which need a live Postgres with the
// migrations applied.
//
// `globalSetup` fails fast if that database is unreachable, and `setupFiles`
// truncates its tables before each test, so both belong here and nowhere else.
export default defineConfig({
  test: {
    name: "db",
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    globalSetup: "./src/test/globalSetup.ts",
    setupFiles: ["./src/test/setup.ts"],
    // These suites share one Postgres database and `setup.ts` truncates its
    // tables in `beforeEach`, so two test files running at once can delete rows
    // out from under each other. Run the files one at a time.
    //
    // This was `poolOptions: { forks: { singleFork: true } }`, which Vitest 4
    // removed — it was being silently ignored, and the three test files were in
    // fact running in three separate forks against the same database.
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ??
        "postgresql://accucery:accucery@localhost:5432/accucery_test",
    },
  },
});
