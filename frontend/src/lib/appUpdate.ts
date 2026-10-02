// Picking up a new deploy (#118). An installed app can stay open for days,
// still running the code it opened with, which is the stale-tab problem seen
// during #98. So each build carries its own id, the server says which build
// is current (/version.json), and when they differ the app reloads onto the
// new one: at start, and whenever it comes back to the foreground.

const RELOADED_FOR_KEY = "accucery:reloadedFor";

// Reload when the server is on a different build, but only once per build:
// if a reload didn't land on it (a cache serving the old page, say), trying
// again would loop forever instead of leaving the Shopper with a working app.
export function shouldReload(current: string, served: unknown, reloadedFor: string | null): served is string {
  return typeof served === "string" && served !== "" && served !== current && served !== reloadedFor;
}

interface UpdateDeps {
  current: string;
  fetchServedBuild: () => Promise<unknown>;
  session: () => Pick<Storage, "getItem" | "setItem">;
  reload: () => void;
}

export async function checkForUpdate({ current, fetchServedBuild, session, reload }: UpdateDeps): Promise<boolean> {
  let served: unknown;
  try {
    served = await fetchServedBuild();
  } catch {
    return false; // Offline or the server's busy: carry on with what's here.
  }
  let reloadedFor: string | null;
  try {
    reloadedFor = session().getItem(RELOADED_FOR_KEY);
  } catch {
    // Without storage there's no loop guard, so don't risk reloading.
    return false;
  }
  if (!shouldReload(current, served, reloadedFor)) return false;
  try {
    session().setItem(RELOADED_FOR_KEY, served);
  } catch {
    return false;
  }
  reload();
  return true;
}

export async function fetchServedBuild(): Promise<unknown> {
  const res = await fetch("/version.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`version.json ${res.status}`);
  return ((await res.json()) as { build?: unknown }).build;
}
