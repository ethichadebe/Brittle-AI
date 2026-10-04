import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertMailConfigured, DEFAULT_FROM, maskEmail, REPLY_TO, sendMail } from "./mailer.js";
import { alreadyRegisteredEmail, confirmEmail, resetPasswordEmail, testEmail } from "./templates.js";

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
      html: expect.stringContaining("email is working"),
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
    vi.stubEnv("FRONTEND_URL", "https://accucery.example");
    expect(() => assertMailConfigured()).toThrow(/RESEND_API_KEY is not set/);
    vi.stubEnv("RESEND_API_KEY", KEY);
    expect(() => assertMailConfigured()).not.toThrow();
  });

  // #148: links in emails are built from FRONTEND_URL; over http they'd leak tokens.
  it("in production, refuses an app address that isn't https", () => {
    vi.stubEnv("RESEND_API_KEY", KEY);
    vi.stubEnv("NODE_ENV", "production");
    for (const url of ["http://accucery.example", "", "accucery.example"]) {
      vi.stubEnv("FRONTEND_URL", url);
      expect(() => assertMailConfigured()).toThrow(/FRONTEND_URL must be the app's https:\/\/ address/);
    }
  });
});

describe("masking an address", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("thandi@example.com")).toBe("t***@example.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
    expect(maskEmail("not-an-address")).toBe("***");
  });
});

describe("the emails (#148, #149)", () => {
  const LINK = "https://accucery.example/confirm-email?token=abc_DEF-123";
  const all = () => [
    testEmail(TO),
    confirmEmail(TO, LINK),
    alreadyRegisteredEmail(TO, "https://accucery.example/sign-in", "https://accucery.example/forgot-password"),
    resetPasswordEmail(TO, "https://accucery.example/reset-password?token=abc_DEF-123"),
  ];

  it("each has a branded HTML version and a plain-text one, saying where replies go", () => {
    vi.stubEnv("FRONTEND_URL", "https://accucery.example");
    for (const mail of all()) {
      expect(mail.to).toBe(TO);
      expect(mail.html).toMatch(/^<!doctype html>/);
      expect(mail.html).toContain("Accucery");
      expect(mail.html).toContain("https://accucery.example/icon-192.png");
      expect(mail.html).toContain(`mailto:${REPLY_TO}`);
      expect(mail.html).toContain("https://accucery.example/privacy");
      expect(mail.text.startsWith("Accucery\n")).toBe(true);
      expect(mail.text).toContain(REPLY_TO);
      expect(mail.text).not.toMatch(/<[a-z]/i);
    }
  });

  it("the button and the plain text carry the same link", () => {
    vi.stubEnv("FRONTEND_URL", "https://accucery.example");
    const mail = confirmEmail(TO, LINK);
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain("expires in 24 hours");
    expect(resetPasswordEmail(TO, LINK).text).toContain("expires in 1 hour");
  });

  it("escapes what goes into the HTML", () => {
    vi.stubEnv("FRONTEND_URL", "https://accucery.example");
    const mail = confirmEmail(TO, 'https://accucery.example/confirm-email?token=x"><script>');
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("never names the address it's sent to in the body", () => {
    for (const mail of all()) {
      expect(mail.text).not.toContain(TO);
      expect(mail.html).not.toContain(TO);
    }
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
