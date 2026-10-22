import { useSyncExternalStore } from "react";

// Installing Accucery from the landing page (2026-10-21), for people who
// don't know a browser can install a website.
//
// - Chrome, Edge and Samsung Internet on Android (and desktop Chrome) offer a
//   site its own install prompt: the browser fires `beforeinstallprompt`, the
//   page keeps it, and a tap on our button shows the phone's install dialog.
// - Safari on iPhone and iPad has no such prompt. The button shows the two
//   steps instead: Share, then Add to Home Screen.
// - Instagram's and Facebook's own browsers, where a tapped ad opens, can't
//   install anything on either phone. The button says to open the page in
//   the phone's browser first.
// - Already installed (opened from the home screen): no button.

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallWay = "prompt" | "ios-steps" | "open-in-browser" | null;

export interface InstallEnv {
  standalone: boolean;
  hasPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|\bFBIOS|TikTok|musical_ly|Snapchat/i;

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function installWay(env: InstallEnv): InstallWay {
  if (env.standalone) return null;
  if (env.hasPrompt) return "prompt";
  if (IN_APP.test(env.userAgent)) return "open-in-browser";
  if (isIos(env.userAgent, env.maxTouchPoints)) return "ios-steps";
  return null;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Called once, before the first render: the browser fires its offer early. */
export function captureInstallPrompt(win: Pick<Window, "addEventListener">): void {
  win.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // ours to show, from the button
    deferred = e as InstallPromptEvent;
    changed();
  });
  win.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    changed();
  });
}

/** Shows the browser's own install dialog. False when there's none to show. */
export async function promptInstall(): Promise<boolean> {
  const offer = deferred;
  if (!offer) return false;
  deferred = null; // a prompt can be shown once
  changed();
  await offer.prompt();
  const { outcome } = await offer.userChoice;
  if (outcome === "accepted") installed = true;
  changed();
  return true;
}

function currentWay(): InstallWay {
  if (typeof window === "undefined") return null;
  const standalone =
    installed ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installWay({ standalone, hasPrompt: deferred !== null, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useInstallWay(): InstallWay {
  return useSyncExternalStore(subscribe, currentWay, () => null);
}

/** Tests only. */
export function resetInstall(): void {
  deferred = null;
  installed = false;
  listeners.clear();
}
