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
    // These files share one Postgres database and `setup.ts` truncates its
    // tables in `beforeEach`, so two running at once would delete rows out from
    // under each other. Keep them serial.
    //
    // There is exactly one `*.db.test.ts` today, so this is currently holding
    // the door for the second one rather than fixing a live race. The way to
    // delete it rather than keep it is per-test isolation — a transaction
    // rolled back after each test, or a schema per worker — not removing it.
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ??
        "postgresql://accucery:accucery@localhost:5432/accucery_test",
    },
  },
});
