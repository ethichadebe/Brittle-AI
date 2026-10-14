import { STORE_CONFIGS } from "@accucery/types";
import type { Incidents } from "./incidents.js";

// #155: a store whose searches keep failing — a site change, a block, or
// ScraperAPI refusing. One failure is noise (a timeout, a blip); this many in
// a row, with nothing working in between, is an incident.
export const FAILS_IN_A_ROW = 5;

const nameOf = (store: string) => STORE_CONFIGS.find((s) => s.slug === store)?.name ?? store;
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);

export function createStoreHealth(incidents: Incidents) {
  const failsInARow = new Map<string, number>();

  /** Told about every search a store answers: with the error when it failed. */
  async function searched(store: string, error?: unknown): Promise<void> {
    const key = `store:${store}`;
    if (error === undefined) {
      failsInARow.delete(store);
      // Only an open incident needs a word; a healthy store stays quiet.
      if (incidents.level(key) !== 0) await incidents.set(key, 0, `✅ ${nameOf(store)} searches are working again.`);
      return;
    }
    const fails = (failsInARow.get(store) ?? 0) + 1;
    failsInARow.set(store, fails);
    if (fails >= FAILS_IN_A_ROW) {
      await incidents.set(
        key,
        1,
        `⚠️ ${nameOf(store)}: the last ${fails} searches failed, so shoppers get no ${nameOf(store)} results.\n` +
          `Latest error: ${reasonOf(error)}\n` +
          `Usually the site changed or is blocking us, or ScraperAPI is out of credits.`
      );
    }
  }

  return { searched };
}
