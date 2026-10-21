import { afterEach, describe, expect, it, vi } from "vitest";
import { captureInstallPrompt, installWay, isIos, promptInstall, resetInstall, type InstallEnv } from "./install";

const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const INSTAGRAM_ANDROID = `${ANDROID_CHROME} Instagram 350.0.0.0.0 Android`;
const INSTAGRAM_IPHONE = `${IPHONE_SAFARI} Instagram 350.0.0.0.0 (iPhone15,3; iOS 18_0)`;
const env = (over: Partial<InstallEnv>): InstallEnv => ({ standalone: false, hasPrompt: false, userAgent: ANDROID_CHROME, maxTouchPoints: 5, ...over });

describe("how the landing page offers to install", () => {
  it("uses the browser's own prompt when it has offered one", () => {
    expect(installWay(env({ hasPrompt: true }))).toBe("prompt");
  });

  it("shows the two Safari steps on an iPhone or iPad", () => {
    expect(installWay(env({ userAgent: IPHONE_SAFARI }))).toBe("ios-steps");
    expect(installWay(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe("ios-steps");
  });

  it("asks people inside Instagram or Facebook to open their own browser first", () => {
    expect(installWay(env({ userAgent: INSTAGRAM_ANDROID }))).toBe("open-in-browser");
    expect(installWay(env({ userAgent: INSTAGRAM_IPHONE }))).toBe("open-in-browser");
    expect(installWay(env({ userAgent: `${IPHONE_SAFARI} [FBAN/FBIOS;FBAV/480.0]` }))).toBe("open-in-browser");
  });

  it("offers nothing once installed, or where there's no way to install", () => {
    expect(installWay(env({ standalone: true, hasPrompt: true }))).toBeNull();
    expect(installWay(env({}))).toBeNull(); // Android Chrome before it offers
    expect(installWay(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }))).toBeNull(); // a real Mac
  });

  it("tells an iPhone from a Mac", () => {
    expect(isIos(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIos(IPAD_AS_MAC, 0)).toBe(false);
  });
});

describe("the browser's install prompt", () => {
  afterEach(() => resetInstall());

  function fakeWindow() {
    const handlers: Record<string, (e: Event) => void> = {};
    return { win: { addEventListener: (type: string, h: (e: Event) => void) => (handlers[type] = h) }, fire: (type: string, e: Event) => handlers[type](e) };
  }

  it("is kept from showing itself, then shown once from the button", async () => {
    const { win, fire } = fakeWindow();
    captureInstallPrompt(win as unknown as Window);
    const prompt = vi.fn(async () => {});
    const offer = { preventDefault: vi.fn(), prompt, userChoice: Promise.resolve({ outcome: "accepted" as const }) };
    fire("beforeinstallprompt", offer as unknown as Event);
    expect(offer.preventDefault).toHaveBeenCalled();
    expect(await promptInstall()).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(await promptInstall()).toBe(false);
  });

  it("has nothing to show before the browser offers", async () => {
    expect(await promptInstall()).toBe(false);
  });
});
