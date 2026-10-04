import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SESSION_TTL_MS } from "./accountSession.js";
import { DEVICE_ID_MAX_AGE_SECONDS } from "./deviceId.js";
import { RESET_TTL_MS } from "./linkTokens.js";

// #150: the privacy notice (frontend/src/routes/privacy.tsx) must say what the
// code does. These are the statements that could quietly stop being true.

const REPO = join(import.meta.dirname, "..", "..");
const notice = readFileSync(join(REPO, "frontend/src/routes/privacy.tsx"), "utf8").replace(/\s+/g, " ");
const privacy = readFileSync(join(REPO, "frontend/src/lib/privacy.ts"), "utf8");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("the privacy notice", () => {
  it("names a real person, not the placeholder", () => {
    const name = privacy.match(/RESPONSIBLE_PERSON = "([^"]*)"/)?.[1] ?? "";
    expect(name.trim().length).toBeGreaterThan(2);
    expect(name).not.toMatch(/__|TODO|TBC/i);
  });

  it("says how long each cookie lasts", () => {
    expect(notice).toContain(`signed in (for ${SESSION_TTL_MS / DAY_MS} days)`);
    expect(notice).toContain(`(for ${(DEVICE_ID_MAX_AGE_SECONDS * 1000) / DAY_MS} days)`);
  });

  it("says how long an unconfirmed sign-up and a reset link last (#148, #149)", () => {
    expect(RESET_TTL_MS).toBe(60 * 60 * 1000);
    expect(notice).toContain("Password reset links expire after an hour");
    expect(notice).toContain("never confirm your email, the sign-up is deleted");
  });

  it("says coordinates aren't stored, and the database has nowhere to store them", () => {
    expect(notice).toContain("We never store it");
    // Comments may say why; only the fields count.
    const schema = readFileSync(join(REPO, "backend/prisma/schema.prisma"), "utf8").replace(/\/\/.*$/gm, "");
    expect(schema).not.toMatch(/latitude|longitude|coordinates/i);
  });

  it("names every outside service the backend sends data to", () => {
    const deps = Object.keys(JSON.parse(readFileSync(join(REPO, "backend/package.json"), "utf8")).dependencies ?? {});
    const code = (readdirSync(join(REPO, "backend/src"), { recursive: true }) as string[])
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => readFileSync(join(REPO, "backend/src", f), "utf8"))
      .join("\n");
    expect(code).toContain("SCRAPERAPI_KEY");
    if (/SCRAPERAPI/.test(code)) expect(notice).toContain("ScraperAPI");
    // #147 will send email through Resend: the notice must say so then.
    if (deps.includes("resend") || /api\.resend\.com/.test(code)) expect(notice).toContain("Resend");
  });
});
