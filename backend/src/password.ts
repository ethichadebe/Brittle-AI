import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

// scrypt via Node's own crypto, deliberately not a new dependency — see the
// #84 PR for why. Stored as "<salt hex>:<derived key hex>", so verification
// never needs a second lookup or a separately stored parameter set.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  // timingSafeEqual throws on a length mismatch rather than returning false,
  // and a corrupt or foreign hash is exactly when that would happen.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
