import { statfs } from "node:fs/promises";
import type { Incidents } from "./incidents.js";

// The server's disk filling up. Everything on the VPS shares one disk: the
// database, Docker's images (each deploy pulls new ones) and the containers'
// logs. A full disk stops the database writing, and with it the app. Warn at
// 85% used, alert at 95%, and say it's fine again only once it's under 80%,
// so a disk sitting at 85% doesn't send a message every hour.
//
// The backend sees the disk through its container: the root of a container is
// on the disk holding Docker's files, which on this server is the only one.

export const WARN_AT = 0.85;
export const ALERT_AT = 0.95;
export const CLEAR_BELOW = 0.8;

export interface DiskUse {
  /** Bytes in use, as `df` counts them. */
  used: number;
  /** Bytes still free for use. */
  free: number;
}

export function diskLevel(share: number, was: number): 0 | 1 | 2 {
  if (share >= ALERT_AT) return 2;
  if (share >= WARN_AT) return 1;
  return was > 0 && share >= CLEAR_BELOW ? 1 : 0;
}

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

export function diskMessage(level: 0 | 1 | 2, disk: DiskUse): string {
  const pct = Math.floor((disk.used / (disk.used + disk.free)) * 100);
  const state = `${pct}% used, ${gb(disk.free)} free`;
  const look = "See docs/server-upkeep.md, \"The disk\".";
  if (level === 2) return `🚨 The server's disk is nearly full: ${state}. The database stops when it's full, and the app with it. ${look}`;
  if (level === 1) return `⚠️ The server's disk is filling up: ${state}. ${look}`;
  return `✅ The server's disk is fine again: ${state}.`;
}

/** The disk this process's root is on, as `df /` would show it. */
export async function rootDisk(): Promise<DiskUse> {
  const s = await statfs("/");
  return { used: (s.blocks - s.bfree) * s.bsize, free: s.bavail * s.bsize };
}

/** One check. */
export async function checkDisk(incidents: Incidents, disk: () => Promise<DiskUse> = rootDisk): Promise<void> {
  const use = await disk();
  const total = use.used + use.free;
  if (!(total > 0)) return;
  const level = diskLevel(use.used / total, await incidents.current("disk"));
  await incidents.set("disk", level, diskMessage(level, use));
}
