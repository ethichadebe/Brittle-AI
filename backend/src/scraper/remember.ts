// A store's default branch, remembered (#130, #132). Shared by Checkers,
// Shoprite and Pick n Pay so the subtle part lives in one place:
//
//   - Looked up at most every `ttlMs`; a failed lookup is retried after
//     `failedTtlMs`, so one bad minute doesn't leave hours of the fallback.
//   - Only the very first lookup is waited for. Once an answer is known it
//     keeps being used while a fresh lookup runs behind it, because a lookup
//     can take a minute (Shoprite's) and no search should wait on a refresh.
//   - A failed refresh keeps the answer it had.
//   - A failed first lookup degrades to `fallback` rather than failing:
//     searches still run, at the site's own default store.

/**
 * Somewhere an answer outlives the process (#157): a deploy restarts the
 * server, and each restart used to look every default branch up again, at
 * ScraperAPI's expense.
 */
export interface RememberedStore<T> {
  load(): Promise<{ value: T; savedAt: Date } | null>;
  save(value: T): Promise<void>;
}

export interface Remembered<T> {
  /** The answer: remembered, waited for the first time, or the fallback. */
  get(): Promise<T>;
  /** Tests only: start again with nothing remembered. */
  forget(): void;
}

export function remember<T>(
  label: string,
  lookUp: () => Promise<T>,
  fallback: T,
  { ttlMs, failedTtlMs, store }: { ttlMs: number; failedTtlMs: number; store?: RememberedStore<T> }
): Remembered<T> {
  interface Entry {
    value: Promise<T>;
    until: number;
    /** A lookup answered, rather than failed. */
    answered: boolean;
  }
  let known: Entry | null = null;
  let refreshing = false;

  const attempt = () =>
    lookUp().then(
      (value) => {
        store?.save(value).catch((err) => console.error(`[scraper:${label}] could not save the default branch:`, err));
        return { value };
      },
      (err) => {
        console.error(`[scraper:${label}] could not find the default branch:`, err);
        return null;
      }
    );

  // What a previous run saved, if anything: used as if this run had found
  // it, at the age it really is, so an old one is still refreshed on time.
  const saved = () =>
    store
      ? store.load().catch((err) => {
          console.error(`[scraper:${label}] could not read the saved default branch:`, err);
          return null;
        })
      : Promise.resolve(null);

  return {
    get() {
      const now = Date.now();
      if (known && known.until > now) return known.value;

      if (known?.answered) {
        const stale = known;
        if (!refreshing) {
          refreshing = true;
          void attempt().then((found) => {
            refreshing = false;
            if (found) known = { value: Promise.resolve(found.value), until: Date.now() + ttlMs, answered: true };
            else stale.until = Date.now() + failedTtlMs;
          });
        }
        return stale.value;
      }

      // Nothing known yet: this caller waits, and so does anyone who asks
      // meanwhile. A saved answer is used first; a stale one is refreshed
      // behind it, as any stale answer is.
      const entry: Entry = { value: Promise.resolve(fallback), until: now + ttlMs, answered: false };
      const pending = saved().then(async (kept) => {
        if (kept) {
          const until = kept.savedAt.getTime() + ttlMs;
          entry.answered = true;
          entry.until = until;
          if (until <= Date.now()) {
            refreshing = true;
            void attempt().then((found) => {
              refreshing = false;
              if (found) known = { value: Promise.resolve(found.value), until: Date.now() + ttlMs, answered: true };
              else entry.until = Date.now() + failedTtlMs;
            });
          }
          return { value: kept.value, fromStore: true };
        }
        const found = await attempt();
        return found && { value: found.value, fromStore: false };
      });
      entry.value = pending.then((found) => (found ? found.value : fallback));
      void pending.then((found) => {
        if (found?.fromStore) return;
        entry.answered = found !== null;
        entry.until = Date.now() + (found ? ttlMs : failedTtlMs);
      });
      known = entry;
      return entry.value;
    },
    forget() {
      known = null;
      refreshing = false;
    },
  };
}
