import { createHash, randomBytes } from "node:crypto";

// #148, #149: the secret in a confirm or reset link. 256 random bits, so it
// can't be guessed; only its hash is stored, so the database alone can't be
// used to confirm or reset anything.

export const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
