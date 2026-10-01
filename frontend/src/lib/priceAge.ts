const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// How old a price is, in the words a shopper would use — "3 days ago" —
// for a price that couldn't be refreshed (#77).
export function priceAge(observedAt: string, now: number = Date.now()): string {
  const age = Math.max(0, now - new Date(observedAt).getTime());
  if (age < HOUR) return "under an hour ago";
  if (age < DAY) {
    const hours = Math.floor(age / HOUR);
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  const days = Math.floor(age / DAY);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
