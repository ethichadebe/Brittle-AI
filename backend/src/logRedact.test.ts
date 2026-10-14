import { describe, it, expect } from "vitest";
import { guardConsole, maskEmailsIn, redactingStream } from "./logRedact.js";

describe("masking email addresses in log lines (#88)", () => {
  it("masks every address, wherever it is in the line", () => {
    expect(maskEmailsIn('Resend refused: "Thandi.M+lists@mail.example.co.za" is not valid; cc a@b.io')).toBe(
      'Resend refused: "T***@mail.example.co.za" is not valid; cc a***@b.io'
    );
    expect(maskEmailsIn('{"url":"/accounts/session?email=x.y@example.com"}')).toBe('{"url":"/accounts/session?email=x***@example.com"}');
  });

  it("leaves an already masked address, and other text, as it is", () => {
    const line = '{"level":30,"msg":"sent to t***@example.com","reqId":"req-1","at":"12:00"}';
    expect(maskEmailsIn(line)).toBe(line);
  });

  it("covers the logger's stream and console", () => {
    const written: string[] = [];
    redactingStream({ write: (l) => written.push(l) }).write("to someone@example.com\n");
    const target = { log: (s: string) => written.push(s), info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Console;
    guardConsole(target);
    target.log("%s failed for", "sign-in", { email: "else@example.com" });
    expect(written.join("\n")).not.toMatch(/someone@|else@/);
    expect(written).toEqual(["to s***@example.com\n", "sign-in failed for { email: 'e***@example.com' }"]);
  });
});
