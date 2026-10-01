// "R 1 240.50": South African style, a space between thousands and a dot
// for cents (#110).
export function formatRand(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const [whole, cents] = Math.abs(amount).toFixed(2).split(".");
  return `${sign}R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents}`;
}

// Up to two letters for the avatar, from the part of an email before the @:
// "thandi.mokoena@…" is "TM", "thandi@…" is "T".
export function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._\-+]+/).filter((p) => /^[a-z]/i.test(p));
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}
