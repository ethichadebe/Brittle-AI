import { describe, it, expect, vi } from "vitest";
import { redact, telegramFromEnv } from "./telegram.js";

const TOKEN = "123456:AAH-fake-bot-token-for-tests";
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("the Telegram sender (#155)", () => {
  it("is off unless both the token and the chat are set, and ignores the old '...' placeholder", () => {
    expect(telegramFromEnv(undefined, "42")).toBeNull();
    expect(telegramFromEnv(TOKEN, undefined)).toBeNull();
    expect(telegramFromEnv("...", "...")).toBeNull();
    expect(telegramFromEnv(TOKEN, "42")).not.toBeNull();
  });

  it("sends the text to the chat, through the bot's own endpoint", async () => {
    const fetchFn = vi.fn(async () => reply(200, { ok: true }));
    const result = await telegramFromEnv(TOKEN, "42", fetchFn as unknown as typeof fetch)!.send("hello");
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: "42", text: "hello" });
  });

  it("says why when Telegram refuses, and never puts the token in the reason", async () => {
    const refused = telegramFromEnv(TOKEN, "42", (async () => reply(400, { ok: false, description: "Bad Request: chat not found" })) as unknown as typeof fetch)!;
    expect(await refused.send("x")).toEqual({ ok: false, error: "Bad Request: chat not found" });

    const offline = telegramFromEnv(TOKEN, "42", (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch)!;
    const result = await offline.send("x");
    expect(result).toEqual({ ok: false, error: "fetch failed" });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("hides the ScraperAPI key and any api_key= an error quotes", async () => {
    const key = "scraperapi-key-0123456789";
    expect(redact(`GET http://api.scraperapi.com/?api_key=${key}&url=x failed`, [key])).toBe("GET http://api.scraperapi.com/?api_key=[hidden]&url=x failed");
    expect(redact(`proxy said ${key}`, [key])).toBe("proxy said [hidden]");
    expect(redact("api_key=somethingelse here", [])).toBe("api_key=[hidden] here");

    const fetchFn = vi.fn(async () => reply(200, { ok: true }));
    vi.stubEnv("SCRAPERAPI_KEY", key);
    await telegramFromEnv(TOKEN, "42", fetchFn as unknown as typeof fetch)!.send(`Latest error: ${key}`);
    vi.unstubAllEnvs();
    const sent = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).text;
    expect(sent).toBe("Latest error: [hidden]");
  });
});
