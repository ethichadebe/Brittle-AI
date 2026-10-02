// Accucery's service worker (#118): opens the app shell fast and when the
// network is poor, and never stands between the Shopper and a price.
//
// - /api/* is never touched: prices, lists and accounts always come from the
//   server, so nothing here can show a stale price as current.
// - Pages are network-first: online, every open gets the newest index.html,
//   so a deploy is picked up. Only when the network fails, or takes longer
//   than NAVIGATION_TIMEOUT_MS, does the cached shell open instead.
// - /assets/* are content-hashed by Vite, so a cached copy is never wrong.
//
// BUILD is replaced at build time (vite.config.ts), which makes this file
// change on every deploy, and that's what tells the browser to install it.
const BUILD = "__BUILD_ID__";
const CACHE = `accucery-${BUILD}`;
const SHELL = "/index.html";
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL, "/manifest.webmanifest"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("accucery-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request) {
  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
    }
    return response;
  });
  // If the cached shell answers first, a later network failure is expected.
  network.catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(resolve, NAVIGATION_TIMEOUT_MS));
  const cached = () => caches.match(SHELL);
  return Promise.race([network, timeout.then(cached)])
    .then((response) => response || network)
    .catch(() => cached().then((response) => response || Response.error()));
}

function cacheFirst(request) {
  return caches.match(request).then(
    (hit) =>
      hit ||
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/version.json" || url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
