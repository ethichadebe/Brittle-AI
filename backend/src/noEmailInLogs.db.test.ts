import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { buildApp } from "./app.js";
import { testPrisma } from "./test/testDb.js";
import { signUp } from "./test/signUp.js";
import { guardConsole } from "./logRedact.js";
import { limiter } from "./rateLimit.js";

// #88 (POPIA): a test that no email address can appear in a server log line.
// Every path that handles an address runs here, with the logger on as in
// production and console guarded as index.ts guards it, including a mail
// provider that quotes the address back in its error, and an address in a URL.
// Then nothing written may hold one.

const methods = ["log", "info", "warn", "error", "debug"] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  limiter.clear();
});

describe("server logs (#88)", () => {
  it("never hold an email address, whatever the path", async () => {
    const written: string[] = [];
    const saved = methods.map((m) => [m, console[m]] as const);
    for (const m of methods) console[m] = (...args: unknown[]) => void written.push(args.map(String).join(" "));
    guardConsole();

    const app = await buildApp({ logStream: { write: (line) => written.push(line) } });
    await app.ready();
    const tag = randomUUID().slice(0, 8);
    const email = `thandi.${tag}@example.com`;
    const password = "correct horse battery staple";
    try {
      // Sign up, confirm, sign in right and wrong, and ask for a reset: the
      // dev mailer logs each email it would send.
      expect((await signUp((o) => app.inject(o), { email, password })).statusCode).toBe(201);
      await app.inject({ method: "POST", url: "/accounts/sign-in", payload: { email, password } });
      await app.inject({ method: "POST", url: "/accounts/sign-in", payload: { email, password: "wrong-password" } });
      await app.inject({ method: "POST", url: "/accounts/password-reset", payload: { email } });
      await app.inject({ method: "POST", url: "/accounts/password-reset", payload: { email: `nobody.${tag}@example.com` } });

      // An address in a URL lands in the request's own log line.
      await app.inject({ method: "GET", url: `/accounts/session?email=${email}` });

      // The mail provider refuses, quoting the address in its error.
      vi.stubEnv("RESEND_API_KEY", "re_test_not_a_real_key");
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: `"refused.${tag}@example.com" bounced` }), { status: 422 }));
      const refused = await app.inject({ method: "POST", url: "/accounts", payload: { email: `refused.${tag}@example.com`, password } });
      expect(refused.statusCode).toBe(502);

      // Paystack refuses a checkout, quoting the customer's address; the
      // route reports it through console.error.
      const signedIn = await app.inject({ method: "POST", url: "/accounts/sign-in", payload: { email, password } });
      const cookies = Object.fromEntries(signedIn.cookies.map((c) => [c.name, c.value]));
      vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_not_a_real_key");
      vi.stubEnv("PAYSTACK_PLAN_MONTHLY", "PLN_monthly");
      vi.stubEnv("PAYSTACK_PLAN_YEARLY", "PLN_yearly");
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ status: false, message: `Customer ${email} is blocked` }), { status: 400 }));
      const checkout = await app.inject({ method: "POST", url: "/premium/checkout", payload: { plan: "monthly" }, cookies });
      expect(checkout.statusCode).toBe(502);
    } finally {
      await app.close();
      for (const [m, fn] of saved) console[m] = fn;
      await testPrisma.$disconnect();
    }

    const all = written.join("\n");
    // The paths ran and were logged, masked...
    expect(all).toContain("t***@example.com");
    expect(all).toContain("r***@example.com");
    expect(all).toMatch(/bounced/);
    expect(all).toMatch(/\[premium\] Paystack: .* t\*\*\*@example\.com is blocked/);
    // ...and no address appears in full.
    expect(all).not.toMatch(new RegExp(`[a-z.]*${tag}@example\\.com`, "i"));
  });
});
