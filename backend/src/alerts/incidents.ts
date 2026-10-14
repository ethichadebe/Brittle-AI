import type { Prisma } from "@prisma/client";
import type { Notifier } from "./telegram.js";

// #155: one message when something goes wrong, one more if it gets worse, and
// one when it recovers. Never one per failure. What has been said is kept in
// the database, so a restart (every deploy) doesn't say it again.
//
// Each incident has a level: 0 is fine, higher is worse. `set` sends its text
// when the level rises, or when it falls back to 0 (the text is then the
// recovery message). A drop that isn't a recovery passes quietly.

export interface IncidentStore {
  load(key: string): Promise<number | null>;
  save(key: string, level: number): Promise<void>;
}

export function memoryIncidentStore(): IncidentStore & { levels: Map<string, number> } {
  const levels = new Map<string, number>();
  return { levels, load: async (k) => levels.get(k) ?? null, save: async (k, l) => void levels.set(k, l) };
}

export function databaseIncidentStore(): IncidentStore {
  const id = (key: string) => `alert:${key}`;
  return {
    async load(key) {
      const { prisma } = await import("../db.js");
      const row = await prisma.rememberedValue.findUnique({ where: { key: id(key) } });
      return row ? ((row.value as { level?: number }).level ?? 0) : null;
    },
    async save(key, level) {
      const { prisma } = await import("../db.js");
      const value = { level } as Prisma.InputJsonValue;
      const savedAt = new Date();
      await prisma.rememberedValue.upsert({ where: { key: id(key) }, create: { key: id(key), value, savedAt }, update: { value, savedAt } });
    },
  };
}

export function createIncidents(store: IncidentStore, notifier: Notifier, log: (msg: string) => void = console.error) {
  // Known levels, so a healthy search doesn't read the database each time.
  const known = new Map<string, number>();
  // One update per key at a time: five failures landing at once send one message.
  const queues = new Map<string, Promise<void>>();

  async function apply(key: string, level: number, text: string): Promise<void> {
    let was = known.get(key);
    if (was === undefined) {
      was = (await store.load(key)) ?? 0;
      known.set(key, was);
    }
    if (level === was) return;
    const speak = level > was || level === 0;
    if (speak) {
      const sent = await notifier.send(text);
      if (!sent.ok) {
        // Not saved, so the next change tries again rather than going quiet.
        log(`[alerts] couldn't send "${key}" to Telegram: ${sent.error}`);
        return;
      }
    }
    await store.save(key, level);
    known.set(key, level);
  }

  function set(key: string, level: number, text: string): Promise<void> {
    const next = (queues.get(key) ?? Promise.resolve()).then(() => apply(key, level, text));
    queues.set(key, next.catch(() => {}));
    return next;
  }

  /** The level last recorded, without a database read once known. */
  function level(key: string): number | undefined {
    return known.get(key);
  }

  return { set, level };
}

export type Incidents = ReturnType<typeof createIncidents>;
