import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
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
        "postgresql://accucery:accucery@localhost:5432/accucery_test",
    },
  },
});
