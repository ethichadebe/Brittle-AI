import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { BranchLookup } from "@accucery/types";
import { api } from "./api";
import {
  POLL_MS,
  currentPosition,
  locateList,
  LocationError,
  locationRemembered,
  pendingLocate,
  rememberLocation,
} from "./location";

// #131: local prices. The shopper's position is used once, to find a branch,
// and never kept or put in a URL.

const HERE = { latitude: -26.1076, longitude: 28.0567 };
const found = (branchName: string | null, more: Partial<BranchLookup> = {}): BranchLookup => ({
  finding: false,
  branchName,
  outOfDelivery: false,
  failed: false,
  ...more,
});

function okJson(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: () => Promise.resolve(body) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("finding a list's branch", () => {
  it("sends the point in the body, never the URL, and answers with the branch name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(found("Checkers FX Sandhurst")));
    vi.stubGlobal("fetch", fetchMock);

    expect(await locateList("list-1", HERE)).toEqual(found("Checkers FX Sandhurst"));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/lists\/list-1\/location$/);
    expect(url).not.toContain(String(HERE.latitude));
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(HERE);
  });

  it("is visible to the list screen while it runs, and gone once it's settled", async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((r) => (answer = r))));

    const lookup = locateList("list-2", HERE);
    expect(pendingLocate("list-2")).toBe(lookup);

    answer(okJson(found(null)));
    expect((await lookup).branchName).toBeNull();
    await Promise.resolve();
    expect(pendingLocate("list-2")).toBeUndefined();
  });

  it("is gone after a failure too, so the list doesn't show 'Finding…' forever", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: "Bad Gateway", json: () => Promise.resolve({}) } as Response));

    await expect(locateList("list-3", HERE)).rejects.toThrow();
    await Promise.resolve();
    expect(pendingLocate("list-3")).toBeUndefined();
  });
});

// #134: a Shoprite that delivers can take a minute to find.
describe("a slow lookup", () => {
  it("asks again until the branch is found, without sending the point again", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson(found(null, { finding: true })))
      .mockResolvedValueOnce(okJson(found(null, { finding: true })))
      .mockResolvedValueOnce(okJson(found("Shoprite Sophiatown")));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = locateList("list-4", HERE);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2 + 10);

    expect(await lookup).toEqual(found("Shoprite Sophiatown"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchMock.mock.calls.slice(1)) {
      expect(url).toMatch(/\/lists\/list-4\/location$/);
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.body).toBeUndefined();
    }
    vi.useRealTimers();
  });

  it("gives up after a few minutes, still reporting it as finding", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => okJson(found(null, { finding: true }))));

    const lookup = locateList("list-5", HERE);
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);

    expect((await lookup).finding).toBe(true);
    vi.useRealTimers();
  });

  it("an out-of-delivery answer comes straight back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(found(null, { outOfDelivery: true }))));
    expect(await locateList("list-6", HERE)).toMatchObject({ outOfDelivery: true, branchName: null });
  });
});

describe("searching as a list's branch", () => {
  it("names the list only when there is one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ products: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await api.search("checkers", "milk", undefined, "list-1");
    await api.search("checkers", "milk");

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/search\?store=checkers&q=milk&listId=list-1$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/search\?store=checkers&q=milk$/);
  });
});

describe("remembering a yes", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
  });

  it("keeps a preference, never a place", () => {
    expect(locationRemembered()).toBe(false);
    rememberLocation(true);
    expect(locationRemembered()).toBe(true);
    expect([...store.values()].join()).not.toContain(String(HERE.latitude));
    rememberLocation(false);
    expect(locationRemembered()).toBe(false);
  });

  it("is simply off where storage is blocked", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } });
    expect(locationRemembered()).toBe(false);
    expect(() => rememberLocation(true)).not.toThrow();
  });
});

describe("reading the position", () => {
  const geolocation = (outcome: { ok: true } | { code: number }) => {
    const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
      if ("ok" in outcome) ok({ coords: { latitude: HERE.latitude, longitude: HERE.longitude } } as GeolocationPosition);
      else fail({ code: outcome.code, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    return getCurrentPosition;
  };

  it("asks for a rough, recent fix: a branch is kilometres wide", async () => {
    const ask = geolocation({ ok: true });
    expect(await currentPosition()).toEqual(HERE);
    // The options are the third argument, which the stand-in itself never reads.
    expect((ask.mock.calls[0] as unknown[])[2]).toMatchObject({ enableHighAccuracy: false });
  });

  it("tells 'you said no' from 'couldn't find you'", async () => {
    geolocation({ code: 1 });
    await expect(currentPosition()).rejects.toMatchObject({ problem: "denied" });
    geolocation({ code: 3 });
    await expect(currentPosition()).rejects.toMatchObject({ problem: "unavailable" });
  });

  it("is unavailable in a browser without location at all", async () => {
    vi.stubGlobal("navigator", {});
    await expect(currentPosition()).rejects.toBeInstanceOf(LocationError);
  });
});
