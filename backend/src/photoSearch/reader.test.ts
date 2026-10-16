import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanQueries, photoReaderFromEnv, PHOTO_MODEL, MAX_QUERIES } from "./reader.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// What Anthropic's API answers, as the SDK receives it.
function answer(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });
}
const message = (text: string, stop_reason = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: PHOTO_MODEL,
  content: [{ type: "text", text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1200, output_tokens: 30 },
});

describe("cleaning what comes back", () => {
  it("trims, drops blanks and repeats, and caps the count and length", () => {
    expect(cleanQueries(["  Clover  full cream milk 2L ", "", "clover full cream MILK 2l", 7, "Bread"])).toEqual([
      "Clover full cream milk 2L",
      "Bread",
    ]);
    expect(cleanQueries(Array.from({ length: 30 }, (_, i) => `item ${i}`))).toHaveLength(MAX_QUERIES);
    expect(cleanQueries(["x".repeat(500)])[0]).toHaveLength(80);
    expect(cleanQueries("not a list")).toEqual([]);
  });
});

describe("the photo reader", () => {
  it("is off without ANTHROPIC_API_KEY", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(photoReaderFromEnv()).toBeNull();
  });

  it("sends the photo to Haiku 5.5 with the store, asks for JSON, and reads the list back", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return answer(message(JSON.stringify({ queries: ["Clover full cream milk 2L", "Albany white bread 700g"] })));
    });
    const read = photoReaderFromEnv()!;
    const queries = await read({ image: "aGVsbG8=", mediaType: "image/jpeg", storeName: "Checkers" });

    expect(queries).toEqual(["Clover full cream milk 2L", "Albany white bread 700g"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/v1\/messages$/);
    const body = sent[0].body as {
      model: string;
      output_config: { effort: string; format: { type: string } };
      messages: { content: { type: string; source?: { data: string; media_type: string }; text?: string }[] }[];
    };
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    const [img, text] = body.messages[0].content;
    expect(img).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "aGVsbG8=" } });
    expect(text.text).toContain("Checkers");
  });

  it("answers nothing for a declined photo or an unreadable answer", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
    let next = message("", "refusal");
    vi.stubGlobal("fetch", async () => answer(next));
    const read = photoReaderFromEnv()!;
    expect(await read({ image: "aGVsbG8=", mediaType: "image/png", storeName: "Makro" })).toEqual([]);
    next = message("not json");
    expect(await read({ image: "aGVsbG8=", mediaType: "image/png", storeName: "Makro" })).toEqual([]);
  });
});
