import { appUrl, REPLY_TO } from "../mail/mailer.js";

// Photo search (2026-10-16): a barcode read on the shopper's phone is turned
// into a product name to search for, through Open Food Facts, the free, open
// product database. Only the barcode number goes there, from this server:
// nothing about the shopper.

const OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product";
const TIMEOUT_MS = 8000;
const FOUND_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const NOT_FOUND_FOR_MS = 24 * 60 * 60 * 1000;
const MAX_REMEMBERED = 5000;

/** EAN-8, UPC-A, EAN-13 or GTIN-14, with a check digit that adds up: a misread one never leaves here. */
export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  // From the right, the digits next to the check digit count three times.
  const sum = digits.reverse().reduce((total, d, i) => total + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  quantity?: string;
}

/** What a shopper would search for: the product's name, and its size when the name doesn't say it. */
export function searchName(p: OffProduct): string | null {
  const name = (p.product_name_en || p.product_name || p.generic_name || "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  const quantity = (p.quantity ?? "").replace(/\s+/g, " ").trim();
  const withSize = quantity && !name.toLowerCase().includes(quantity.toLowerCase()) ? `${name} ${quantity}` : name;
  return withSize.slice(0, 80);
}

type Fetch = typeof fetch;

/** Looks barcodes up, remembering answers (including "not known") so a busy barcode is asked about once. */
export function createBarcodeLookup(fetchFn: Fetch = (...a) => fetch(...a), now: () => number = Date.now) {
  const remembered = new Map<string, { name: string | null; until: number }>();

  return async function lookup(code: string): Promise<string | null> {
    const hit = remembered.get(code);
    if (hit && hit.until > now()) return hit.name;

    const res = await fetchFn(`${OFF_PRODUCT}/${code}.json?fields=product_name,product_name_en,generic_name,quantity`, {
      // Open Food Facts asks every app to say who it is and how to reach them.
      headers: { "User-Agent": `Accucery/1.0 (${appUrl()}; ${REPLY_TO})` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 404 is Open Food Facts' "not known"; anything else unexpected is an outage.
    if (!res.ok && res.status !== 404) throw new Error(`Open Food Facts answered ${res.status}`);
    const body = (await res.json().catch(() => null)) as { status?: number; product?: OffProduct } | null;
    if (res.ok && !body) throw new Error("Open Food Facts answered with something unreadable");
    const name = body?.status === 1 && body.product ? searchName(body.product) : null;

    if (remembered.size >= MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!);
    remembered.set(code, { name, until: now() + (name ? FOUND_FOR_MS : NOT_FOUND_FOR_MS) });
    return name;
  };
}
