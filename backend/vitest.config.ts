import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: "./src/test/globalSetup.ts",
    setupFiles: ["./src/test/setup.ts"],
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      DATABASE_URL:
        "postgresql://accucery:accucery@localhost:5432/accucery_test",
    },
  },
});
