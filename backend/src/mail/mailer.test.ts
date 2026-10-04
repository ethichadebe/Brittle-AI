import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertMailConfigured, DEFAULT_FROM, maskEmail, REPLY_TO, sendMail } from "./mailer.js";
import { testEmail } from "./templates.js";

// #147. Resend is a stand-in here: no test reaches the network.

const KEY = "re_test_7c1d9f";
const TO = "thandi.mokoena@example.com";

function resend(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function logs() {
  const lines: string[] = [];
  for (const level of ["info", "log", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void lines.push(args.join(" ")));
  }
  return lines;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sending an email", () => {
  it("posts it to Resend, from the app's address, with replies going to privacy@", async () => {
    vi.stubEnv("RESEND_API_KEY", KEY);
    const fetchMock = resend(200, { id: "email-123" });
    logs();

    expect(await sendMail(testEmail(TO))).toBe("email-123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body)).toEqual({
      from: DEFAULT_FROM,
      to: [TO],
      reply_to: REPLY_TO,
      subject: "Accucery test email",
      text: expect.stringContaining("email is working"),
    });
  });

  it("uses MAIL_FROM when it's set", async () => {
    vi.stubEnv("RESEND_API_KEY", KEY);
    vi.stubEnv("MAIL_FROM", "Accucery <hello@ethichadebe.me>");
    const fetchMock = resend(200, { id: "email-124" });
    logs();
    await sendMail(testEmail(TO));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).from).toBe("Accucery <hello@ethichadebe.me>");
  });

  it("says why Resend refused, without the key or the full address", async () => {
    vi.stubEnv("RESEND_API_KEY", KEY);
    resend(403, { statusCode: 403, message: "The ethichadebe.me domain is not verified.", name: "validation_error" });
    const lines = logs();

    const err = await sendMail(testEmail(TO)).catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Resend refused the email to t***@example.com: 403 The ethichadebe.me domain is not verified.");
    expect([(err as Error).message, ...lines].join("\n")).not.toContain(KEY);
    expect([(err as Error).message, ...lines].join("\n")).not.toContain(TO);
  });

  it("never logs an address in full", async () => {
    vi.stubEnv("RESEND_API_KEY", KEY);
    resend(200, { id: "email-125" });
    const lines = logs();
    await sendMail(testEmail(TO));
    expect(lines.join("\n")).toContain("t***@example.com");
    expect(lines.join("\n")).not.toContain("thandi");
  });
});

describe("without a key", () => {
  it("in development, sends nothing and says so", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const fetchMock = resend(200, { id: "never" });
    const lines = logs();

    expect(await sendMail(testEmail(TO))).toBe("not-sent");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("not sent (no RESEND_API_KEY)");
    expect(() => assertMailConfigured()).not.toThrow();
  });

  it("in production, the server refuses to start, naming what to set", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertMailConfigured()).toThrow(/RESEND_API_KEY is not set/);
    vi.stubEnv("RESEND_API_KEY", KEY);
    expect(() => assertMailConfigured()).not.toThrow();
  });
});

describe("masking an address", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("thandi@example.com")).toBe("t***@example.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
    expect(maskEmail("not-an-address")).toBe("***");
  });
});

describe("the test email", () => {
  it("is plain text, branded, and says where replies go", () => {
    const mail = testEmail(TO);
    expect(mail.text.startsWith("Accucery\n")).toBe(true);
    expect(mail.text).toContain(REPLY_TO);
    expect(mail.text).not.toMatch(/<[a-z]/i);
  });
});

describe("the server itself (#147)", () => {
  // The server is started by src/index.ts; running it here would need the
  // whole app built. What matters is that it checks before it listens.
  it("checks for the key before it starts listening", () => {
    const entry = readFileSync(join(import.meta.dirname, "..", "index.ts"), "utf8");
    const check = entry.search(/^assertMailConfigured\(\);$/m);
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(entry.indexOf("buildApp("));
    expect(check).toBeLessThan(entry.indexOf(".listen("));
  });
});
