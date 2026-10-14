import type { Incidents } from "./incidents.js";

// The app answering with errors (5xx): a bug in a new version, the database
// down, or something it depends on (email, a store, Paystack) failing for
// everyone. One error is noise; this many in a few minutes is an incident.
// It's over once a quarter of an hour passes without one.
//
// Counted per route, by its pattern ("/lists/:listId"), never the address
// asked for, so a message never carries an id or an email.

export const SPIKE = 10;
export const WINDOW_MS = 5 * 60_000;
export const QUIET_MS = 15 * 60_000;
const KEY = "server-errors";

type ResponseObserver = (status: number, route: string) => void;

// Set once at startup by the alerts; until then (and in tests) nothing listens.
let observer: ResponseObserver = () => {};
export function observeResponses(next: ResponseObserver): void {
  observer = next;
}
/** Called by the app for every response it sends. */
export function responded(status: number, route: string): void {
  observer(status, route);
}

export function createErrorWatch(incidents: Incidents, now: () => number = Date.now) {
  let recent: { at: number; what: string }[] = [];
  // From the start, so a restart mid-incident waits a quiet quarter hour too.
  let lastAt = now();

  function trim(): void {
    const since = now() - WINDOW_MS;
    recent = recent.filter((e) => e.at > since);
  }

  function summary(): string {
    const counts = new Map<string, number>();
    for (const e of recent) counts.set(e.what, (counts.get(e.what) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([what, n]) => `${what} ×${n}`)
      .join(", ");
  }

  /** Told about every response. */
  async function responded(status: number, route: string): Promise<void> {
    if (status < 500) return;
    lastAt = now();
    recent.push({ at: lastAt, what: `${route} (${status})` });
    trim();
    if (recent.length >= SPIKE && (await incidents.current(KEY)) === 0) {
      await incidents.set(
        KEY,
        1,
        `🚨 Accucery is answering with errors: ${recent.length} in the last ${WINDOW_MS / 60_000} minutes.\n` +
          `Mostly: ${summary()}\n` +
          `Check: cd /opt/accucery && docker compose -f docker-compose.prod.yml logs --since 15m backend`
      );
    }
  }

  /** Run every minute or so: closes the incident once it's been quiet. */
  async function check(): Promise<void> {
    trim();
    if (now() - lastAt < QUIET_MS) return;
    if ((await incidents.current(KEY)) !== 0) {
      await incidents.set(KEY, 0, `✅ Accucery's errors have stopped: none in the last ${QUIET_MS / 60_000} minutes.`);
    }
  }

  return { responded, check };
}
