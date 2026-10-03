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
  { ttlMs, failedTtlMs }: { ttlMs: number; failedTtlMs: number }
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
      (value) => ({ value }),
      (err) => {
        console.error(`[scraper:${label}] could not find the default branch:`, err);
        return null;
      }
    );

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

      // Nothing known yet: this caller waits, and so does anyone who asks meanwhile.
      const entry: Entry = { value: Promise.resolve(fallback), until: now + ttlMs, answered: false };
      const pending = attempt();
      entry.value = pending.then((found) => (found ? found.value : fallback));
      void pending.then((found) => {
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
