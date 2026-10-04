import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { devOutbox } from "../mail/mailer.js";

// #148: signing up now emails a link, and the Account exists only once it's
// opened. Tests that just need an Account go through both steps here, the way
// a shopper does, reading the link from the outbox the mailer keeps when
// there's no Resend key.

type Send = (opts: InjectOptions) => Promise<LightMyRequestResponse>;

/** The token in the newest email to this address, if that email links to `path`. */
export function tokenFor(to: string, path: "/confirm-email" | "/reset-password"): string | undefined {
  const latest = [...devOutbox].reverse().find((m) => m.to === to);
  return latest?.text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`))?.[1];
}

/**
 * Signs up and opens the confirm link, both through `send` (so on the same
 * device). Answers the confirm response, or the sign-up one if it stopped
 * there (a refusal, or an email that already had an account).
 */
export async function signUp(send: Send, payload: { email: string; password: string }, extra: Partial<InjectOptions> = {}) {
  const asked = await send({ ...extra, method: "POST", url: "/accounts", payload });
  if (asked.statusCode !== 202) return asked;
  const token = tokenFor(payload.email.trim().toLowerCase(), "/confirm-email");
  if (!token) return asked;
  return send({ ...extra, method: "POST", url: "/accounts/confirm", payload: { token } });
}
