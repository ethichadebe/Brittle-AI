// Per CONTEXT.md: Pack Size is "how much product one unit contains, as the
// store names it". Parsed here only from the two dimensions actually seen
// in this catalogue — mass and volume — normalised to a common base unit
// per dimension (grams, millilitres) so two products can be compared by
// Unit Price. A name outside these forms parses to null rather than a
// guess: #89 requires refusing a match, never inventing a size.

export type PackUnit = "g" | "ml";

export interface PackSize {
  quantity: number;
  unit: PackUnit;
}

function toBase(amount: number, rawUnit: string): PackSize {
  const unit = rawUnit.toLowerCase();
  if (unit === "kg") return { quantity: amount * 1000, unit: "g" };
  if (unit === "g") return { quantity: amount, unit: "g" };
  if (unit === "l") return { quantity: amount * 1000, unit: "ml" };
  return { quantity: amount, unit: "ml" }; // ml
}

const NUM = "\\d+(?:[.,]\\d+)?";
const UNIT = "kg|g|ml|l";

// "6 x 1 L" — a multiplier form, tried first so its trailing "1 L" is never
// mistaken for a standalone size half the size it actually is.
const MULTIPLIER = new RegExp(`(${NUM})\\s*[x×]\\s*(${NUM})\\s*(${UNIT})\\b`, "gi");
// "500 g", "2L" — spacing is optional either way.
const SIMPLE = new RegExp(`(${NUM})\\s*(${UNIT})\\b`, "gi");

function toNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

/** The rightmost match, since a pack size conventionally trails the name. */
function lastMatch(pattern: RegExp, name: string): RegExpExecArray | null {
  pattern.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(name))) last = m;
  return last;
}

export function parsePackSize(name: string): PackSize | null {
  const multiplier = lastMatch(MULTIPLIER, name);
  if (multiplier) {
    const count = toNumber(multiplier[1]);
    const each = toBase(toNumber(multiplier[2]), multiplier[3]);
    return { quantity: count * each.quantity, unit: each.unit };
  }

  const simple = lastMatch(SIMPLE, name);
  if (simple) return toBase(toNumber(simple[1]), simple[2]);

  return null;
}
