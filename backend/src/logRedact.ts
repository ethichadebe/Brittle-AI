import { format } from "node:util";
import { maskEmail } from "./mail/mailer.js";

// #88 (POPIA): no email address in a log line. The app's own messages mask
// addresses already (maskEmail), but an error from somewhere else can carry
// one: a mail provider quoting the address it refused, say, or an address in
// a URL. So every line is masked once more on its way out, whatever wrote it.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

/** "thandi@example.com" anywhere in the text -> "t***@example.com". */
export function maskEmailsIn(text: string): string {
  return text.replace(EMAIL, (address) => maskEmail(address));
}

interface Writable {
  write(line: string): unknown;
}

/** The app's log stream (Fastify's logger), masking each line. */
export function redactingStream(out: Writable = process.stdout): Writable {
  return { write: (line: string) => out.write(maskEmailsIn(line)) };
}

const METHODS = ["log", "info", "warn", "error", "debug"] as const;

/** Masks whatever is written through console.*, as the logger's lines are. */
export function guardConsole(target: Pick<Console, (typeof METHODS)[number]> = console): void {
  for (const method of METHODS) {
    const write = target[method].bind(target);
    target[method] = (...args: unknown[]) => write(maskEmailsIn(format(...args)));
  }
}
