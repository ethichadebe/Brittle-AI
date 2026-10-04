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
  text: string;
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
 * Called once at startup. In production a missing key stops the server here,
 * with a message saying what to set, rather than at the first sign-up.
 */
export function assertMailConfigured(): void {
  if (production() && !config().apiKey) {
    throw new Error("RESEND_API_KEY is not set. The app can't send email without it: add it to .env (see .env.example).");
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
    console.info(`[mail] not sent (no RESEND_API_KEY): "${mail.subject}" to ${maskEmail(mail.to)}`);
    return "not-sent";
  }

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], reply_to: REPLY_TO, subject: mail.subject, text: mail.text }),
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
