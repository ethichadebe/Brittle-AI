import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Compose only forwards the environment variables it names. A variable can be
// present in .env, correct, and still be invisible inside the container — which
// is not a crash but a store that quietly returns nothing.
//
// This has now happened twice: SCRAPERAPI_KEY was absent from this deployment
// for four months, and WOOLWORTHS_SEARCH_KEY was documented in .env.example but
// never wired into docker-compose.prod.yml, so Woolworths went live returning an
// empty list in 0s. This test is here so there is no third time.

const REPO = join(import.meta.dirname, "..", "..", "..");

// Read by the test harness, never by the running container.
const NOT_IN_CONTAINER = new Set(["DATABASE_URL_TEST"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
  });
}

describe("environment wiring", () => {
  it("passes every env var the backend reads through to the container", () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(REPO, "backend", "src"))) {
      for (const m of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
        if (!NOT_IN_CONTAINER.has(m[1])) used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);

    const compose = readFileSync(join(REPO, "docker-compose.prod.yml"), "utf8");
    const missing = [...used].filter((name) => !compose.includes(`${name}:`)).sort();
    expect(missing).toEqual([]);
  });
});
