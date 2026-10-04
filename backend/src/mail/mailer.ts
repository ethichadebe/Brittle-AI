// Email, through Resend's HTTP API (#147). One POST, so no SDK and no new
// dependency: https://resend.com/docs/api-reference/emails/send-email
//
// An address is never logged in full (maskEmail), and the key never leaves
// the Authorization header.

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

/** Who the app's email comes from, and where a reply goes. */
export const DEFAULT_FROM = "Accucery <noreply@ethichadebe.me>";
export const REPLY_TO = "privacy@ethichadebe.me";

export interface Mail {
  to: string;
  subject: string;
  /** The plain-text copy: what some mail apps show, and what spam filters like to see. */
  text: string;
  html: string;
}

interface MailConfig {
  apiKey: string;
  from: string;
}

function config(): MailConfig {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim() ?? "",
    from: process.env.MAIL_FROM?.trim() || DEFAULT_FROM,
  };
}

const production = () => process.env.NODE_ENV === "production";

/**
 * Where the app lives, for links in emails (#148, #149). Taken from the
 * server's own settings, never from a request: a request can claim any
 * origin, and a confirm link pointing at someone else's site would hand them
 * the token.
 */
export function appUrl(): string {
  return (process.env.FRONTEND_URL ?? "http://localhost:5173").trim().replace(/\/+$/, "");
}

/**
 * Without a key, outside production: what would have been sent, newest last,
 * so tests and local development can follow a link. Never filled in
 * production, where a missing key stops the server instead.
 */
export const devOutbox: Mail[] = [];
const DEV_OUTBOX_LIMIT = 50;

/**
 * Called once at startup. In production a missing key stops the server here,
 * with a message saying what to set, rather than at the first sign-up.
 */
export function assertMailConfigured(): void {
  if (!production()) return;
  if (!config().apiKey) {
    throw new Error("RESEND_API_KEY is not set. The app can't send email without it: add it to .env (see .env.example).");
  }
  // Links in emails are built from this; over plain HTTP they'd leak tokens.
  if (!appUrl().startsWith("https://")) {
    throw new Error("FRONTEND_URL must be the app's https:// address: links in emails are built from it (see .env.example).");
  }
}

/** "thandi@example.com" -> "t***@example.com": enough to tell two apart, not enough to write to. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1) return "***";
  return `${address[0]}***${address.slice(at)}`;
}

/** Sends one email and answers Resend's id for it. Throws if Resend refuses. */
export async function sendMail(mail: Mail): Promise<string> {
  const { apiKey, from } = config();
  if (!apiKey) {
    // Local development and tests: nothing is sent, and the log says so.
    if (production()) throw new Error("RESEND_API_KEY is not set");
    devOutbox.push(mail);
    if (devOutbox.length > DEV_OUTBOX_LIMIT) devOutbox.shift();
    // The link, so a developer can follow it. Not in production: there's a key.
    const link = mail.text.match(/https?:\/\/\S+/)?.[0];
    console.info(`[mail] not sent (no RESEND_API_KEY): "${mail.subject}" to ${maskEmail(mail.to)}${link ? ` - ${link}` : ""}`);
    return "not-sent";
  }

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], reply_to: REPLY_TO, subject: mail.subject, text: mail.text, html: mail.html }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok || typeof body?.id !== "string") {
    // Resend's own message ("The domain is not verified", say), never the key.
    throw new Error(`Resend refused the email to ${maskEmail(mail.to)}: ${res.status} ${body?.message ?? res.statusText}`);
  }
  console.info(`[mail] sent "${mail.subject}" to ${maskEmail(mail.to)} (${body.id})`);
  return body.id;
}
