import { STORE_CONFIGS } from "@accucery/types";

// Words and numbers for the Owner's dashboard (routes/admin.tsx).

export const storeName = (slug: string) => STORE_CONFIGS.find((s) => s.slug === slug)?.name ?? slug;

/** An open alert's key ("store:checkers", "credits", "disk", "server-errors") in plain words. */
export function alertLabel(key: string): string {
  if (key.startsWith("store:")) return `${storeName(key.slice("store:".length))} searches are failing`;
  if (key === "credits") return "ScraperAPI credits are running low";
  if (key === "disk") return "The server's disk is filling up";
  if (key === "server-errors") return "The app is answering with errors";
  return key;
}

/** 1 234 567 bytes -> "1.2 MB". */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Cents -> "R1 234.50", spaced the way the app writes amounts. */
export function rands(cents: number): string {
  const [whole, part] = (cents / 100).toFixed(2).split(".");
  return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${part}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86_400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Thousands with a plain space, as the app writes them. */
export const count = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
