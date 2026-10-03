// Do a store's prices change with where the shopper is, and by how much? (#66)
//
// Prices the same searches at one place in each of South Africa's nine
// provinces, per store, and reports which products cost the same everywhere,
// which differ (and by how much), and which are only stocked in some places.
//
// HOW EACH STORE TURNS A PLACE INTO A BRANCH
//
// Read off browser recordings of each site, signed out, on 2026-10-02 (#66).
// The recordings themselves are not in the repo.
//
//   Checkers, Shoprite (one platform)
//     POST /api/store/fetch-store-contexts?update=false
//       {address:{coordinates:{latitude,longitude},...}} -> {storeContexts}
//     POST /api/catalogue/get-products-filter  {storeContexts, ...search}
//     POST /api/browse-by-store/get-stores-by-location -> nearest store's name
//     Shoprite answers "servicedByOtherBrand" where it doesn't deliver.
//
//   Pick n Pay
//     POST /pnphybris/v2/pnp-spa/users/anonymous/carts          -> {guid, baseStore}
//     POST .../carts/{guid}/addresses/delivery {latitude,longitude,...}
//     GET  .../carts/{guid}                                     -> {baseStore:{uid}}
//     POST .../products/search?query=&storeCode={uid}            -> {products}
//     A new cart starts at a default store before any address is given; the
//     probe prints which, since that is whose prices you get without one.
//
// Woolworths is not here: it maps an address to a price zone, but through a
// Google place id rather than coordinates. Makro showed no difference at all.
//
// Run inside the backend container, which is the only place with Playwright
// and Chromium installed. scripts/ is not in the image, so the probe is piped
// in, and report.sh posts the output to #66:
//
//   cd /opt/accucery && bash scripts/report.sh 66 -- sh -c \
//     'docker compose -f docker-compose.prod.yml exec -T backend \
//        node --input-type=module < scripts/probe-location-prices.mjs'
//
// COST. Checkers and Shoprite sit behind AWS WAF, which blocks the VPS's own
// address, so they go through the ScraperAPI residential proxy the scrapers
// use. Images, fonts and stylesheets are blocked to spend fewer credits, but
// a full run is still roughly a few hundred. Narrow it to spend fewer:
//
//   -e STORES=pick-n-pay -e QUERIES=eggs -e PLACES=JHB,CPT,DBN
//
// Prints no secrets: no cookies, no keys, only store names and prices.

export const PLACES = [
  { code: "JHB", province: "Gauteng", city: "Sandton", postalCode: "2196", latitude: -26.1076, longitude: 28.0567 },
  { code: "CPT", province: "Western Cape", city: "Sea Point", postalCode: "8005", latitude: -33.9175, longitude: 18.387 },
  { code: "DBN", province: "KwaZulu-Natal", city: "uMhlanga", postalCode: "4320", latitude: -29.7258, longitude: 31.0715 },
  { code: "GQB", province: "Eastern Cape", city: "Gqeberha", postalCode: "6001", latitude: -33.9608, longitude: 25.6022 },
  { code: "BFN", province: "Free State", city: "Bloemfontein", postalCode: "9301", latitude: -29.0852, longitude: 26.1596 },
  { code: "PLK", province: "Limpopo", city: "Polokwane", postalCode: "0699", latitude: -23.9045, longitude: 29.4689 },
  { code: "MBB", province: "Mpumalanga", city: "Mbombela", postalCode: "1200", latitude: -25.4753, longitude: 30.9694 },
  { code: "RTB", province: "North West", city: "Rustenburg", postalCode: "0299", latitude: -25.6676, longitude: 27.2421 },
  { code: "KIM", province: "Northern Cape", city: "Kimberley", postalCode: "8301", latitude: -28.7282, longitude: 24.7499 },
];

// ---------------------------------------------------------------------------
// Pure parts: tested offline by probe-location-prices.test.mjs.

// Same request body the scraper sends (backend/src/scraper/shopriteGroup.ts).
export function shopriteGroupSearchBody(query, storeContexts) {
  return {
    storeContexts,
    filterData: {
      filter: {
        showAllDisplayVariants: false,
        showNotRangedProducts: false,
        productListSource: { search: query },
        paginationOptions: { page: 0, pageSize: 40 },
        filterOptions: { filterIds: [], dealsOnly: false, brandOptions: [], departmentOptions: [], serviceOptions: [], facetOptions: [] },
        sortOptions: null,
      },
      displayOptions: { includeDisplayCategoryTree: false },
    },
    forYouBonusBuyIds: [],
    url: null,
  };
}

export function shopriteGroupAddress(place) {
  return {
    address: {
      fullAddress: `${place.city}, South Africa`,
      city: place.city,
      coordinates: { longitude: place.longitude, latitude: place.latitude },
      id: "",
      type: "",
      name: "",
    },
    acceptedLimitedExperience: false,
  };
}

export function pnpDeliveryAddress(place) {
  return {
    streetnumber: "",
    streetname: "",
    district: place.city,
    town: place.city,
    postalCode: place.postalCode,
    latitude: place.latitude,
    longitude: place.longitude,
    country: { isocode: "ZA" },
    defaultAddress: false,
    line2: place.city,
  };
}

const money = (n) => (Number.isFinite(n) ? n.toFixed(2) : "-");

// One shape for every store: {id, name, price, promo}.
export function parseShopriteGroupProducts(json) {
  const items = json?.products ?? json?.data?.products ?? [];
  return items
    .map((p) => {
      const price = Number(p.price);
      // oldPrice arrives in cents ("2599"), price in rands ("25.99").
      const old = p.oldPrice != null ? Number(p.oldPrice) / 100 : NaN;
      return {
        id: String(p.id ?? ""),
        name: String(p.name ?? ""),
        price,
        promo: Boolean(p.bonusBuy) || (Number.isFinite(old) && old > price),
      };
    })
    .filter((p) => p.id && p.name && Number.isFinite(p.price) && p.price > 0);
}

export function parsePnpProducts(json) {
  return (json?.products ?? [])
    .map((p) => {
      const price = Number(p.price?.value);
      const old = Number(p.price?.oldPrice ?? 0);
      return { id: String(p.code ?? ""), name: String(p.name ?? ""), price, promo: old > price };
    })
    .filter((p) => p.id && p.name && Number.isFinite(p.price) && p.price > 0);
}

// results: [{ place, branch, products: [{id,name,price,promo}] }] for one store.
// Compares products seen at two or more places.
export function compare(results) {
  const served = results.filter((r) => r.products.length > 0);
  const byId = new Map();
  for (const r of served) {
    for (const p of r.products) {
      if (!byId.has(p.id)) byId.set(p.id, { name: p.name, at: new Map() });
      // The first sighting per place wins: one search can list a product twice.
      if (!byId.get(p.id).at.has(r.place.code)) byId.get(p.id).at.set(r.place.code, p);
    }
  }
  const shared = [];
  let onlySome = 0;
  for (const [id, entry] of byId) {
    if (entry.at.size < 2) {
      if (served.length > 1) onlySome++;
      continue;
    }
    if (entry.at.size < served.length) onlySome++;
    const prices = [...entry.at.values()].map((p) => p.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    shared.push({ id, name: entry.name, at: entry.at, lo, hi, spread: hi - lo });
  }
  const differ = shared.filter((s) => s.spread > 0.004).sort((a, b) => b.spread - a.spread);
  return { places: served.length, shared: shared.length, same: shared.length - differ.length, differ, onlySome };
}

export function report(storeName, results, extra = []) {
  const out = [`== ${storeName} ==`, ...extra];
  for (const r of results) {
    const where = `${r.place.code} ${r.place.city}`.padEnd(16);
    out.push(`${where} ${r.error ? `ERROR ${r.error}` : `${String(r.products.length).padStart(3)} items  ${r.branch ?? "?"}`}`);
  }
  const c = compare(results);
  if (c.places < 2) {
    out.push(`(fewer than 2 places answered, nothing to compare)`, "");
    return out.join("\n");
  }
  out.push(
    `seen at 2+ places: ${c.shared}`,
    `  same price everywhere: ${c.same}`,
    `  price differs:         ${c.differ.length}`,
    `stocked at only some places: ${c.onlySome}`
  );
  for (const d of c.differ.slice(0, 15)) {
    out.push(`- ${d.name.slice(0, 48)}  (R${money(d.lo)}-R${money(d.hi)})`);
    out.push(
      "    " +
        [...d.at.entries()].map(([code, p]) => `${code} ${money(p.price)}${p.promo ? "*" : ""}`).join("  ")
    );
  }
  if (c.differ.length > 15) out.push(`  ...and ${c.differ.length - 15} more`);
  if (c.differ.some((d) => [...d.at.values()].some((p) => p.promo))) out.push(`  * on promotion there`);
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// The live run.

async function main() {
  const STORES = (process.env.STORES || "checkers shoprite pick-n-pay").split(/[\s,]+/).filter(Boolean);
  const QUERIES = (process.env.QUERIES || "eggs bread milk").split(/[\s,]+/).filter(Boolean);
  const wanted = (process.env.PLACES || "").split(/[\s,]+/).filter(Boolean);
  const places = wanted.length ? PLACES.filter((p) => wanted.includes(p.code)) : PLACES;
  // The WAF-fronted stores need the residential proxy from the VPS; PnP is tried direct.
  const PROXY_STORES = (process.env.PROXY_STORES ?? "checkers shoprite").split(/[\s,]+/).filter(Boolean);
  const key = process.env.SCRAPERAPI_KEY;

  const ORIGINS = {
    checkers: process.env.CHECKERS_ORIGIN || "https://www.checkers.co.za",
    shoprite: process.env.SHOPRITE_ORIGIN || "https://www.shoprite.co.za",
    "pick-n-pay": process.env.PNP_ORIGIN || "https://www.pnp.co.za",
  };

  console.log(`location prices probe (#66)`);
  console.log(`stores:  ${STORES.join(" ")}`);
  console.log(`queries: ${QUERIES.join(" ")}`);
  console.log(`places:  ${places.map((p) => p.code).join(" ")}\n`);

  const { chromium } = await import("playwright-extra");
  const stealth = (await import("puppeteer-extra-plugin-stealth")).default;
  chromium.use(stealth());
  const { newInjectedContext } = await import("fingerprint-injector");

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PROBE_CHROMIUM && { executablePath: process.env.PROBE_CHROMIUM }),
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  async function openStore(store) {
    const useProxy = PROXY_STORES.includes(store) && Boolean(key);
    const context = await newInjectedContext(browser, {
      newContextOptions: {
        viewport: { width: 1366, height: 768 },
        ...(useProxy && {
          proxy: { server: "http://proxy-server.scraperapi.com:8001", username: "scraperapi", password: key },
        }),
      },
    });
    // Nothing on screen is read, so pictures and styling are skipped: fewer credits.
    await context.route("**/*", (route) =>
      ["image", "media", "font", "stylesheet"].includes(route.request().resourceType()) ? route.abort() : route.continue()
    );
    const page = await context.newPage();
    const origin = ORIGINS[store];
    try {
      await page.goto(`${origin}/`, { waitUntil: "networkidle", timeout: 45000 });
    } catch (e) {
      console.log(`  warmup: ${String(e.message).split("\n")[0].slice(0, 80)}`);
    }
    const call = (method, path, body, headers = {}) =>
      page.evaluate(
        async ({ url, method, body, headers }) => {
          const res = await fetch(url, {
            method,
            headers: { Accept: "application/json, text/plain, */*", ...(body !== undefined && { "Content-Type": "application/json" }), ...headers },
            ...(body !== undefined && { body: JSON.stringify(body) }),
          });
          const text = await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 60)}`);
          return text ? JSON.parse(text) : null;
        },
        { url: `${origin}${path}`, method, body, headers }
      );
    return { context, call, useProxy };
  }

  // Playwright wraps an in-page throw as "page.evaluate: Error: ..."; keep the cause.
  const errText = (e) =>
    String(e?.message ?? e).split("\n")[0].replace(/^page\.evaluate: (Error: )?/, "").slice(0, 70);

  async function shopriteGroup(store, brand) {
    const { context, call, useProxy } = await openStore(store);
    const results = [];
    try {
      for (const place of places) {
        try {
          const ctx = await call("POST", "/api/store/fetch-store-contexts?update=false", shopriteGroupAddress(place));
          const storeContexts = ctx?.storeContexts ?? [];
          if (!storeContexts.length) {
            const other = ctx?.servicedByOtherBrand;
            results.push({ place, branch: other ? `not served (${typeof other === "string" ? other : "other brand"})` : "not served", products: [] });
            continue;
          }
          let branch = `store ${String(storeContexts[0].storeId).slice(-6)}`;
          try {
            const near = await call("POST", "/api/browse-by-store/get-stores-by-location", {
              payload: { latitude: place.latitude, longitude: place.longitude, limit: 1, brands: [brand] },
            });
            if (near?.[0]?.name) branch = `${near[0].name} (${near[0].distanceKm ?? "?"}km)`;
          } catch {
            // The name is a label only; the prices don't depend on it.
          }
          const products = [];
          for (const q of QUERIES) {
            products.push(...parseShopriteGroupProducts(await call("POST", "/api/catalogue/get-products-filter", shopriteGroupSearchBody(q, storeContexts))));
          }
          results.push({ place, branch, products });
        } catch (e) {
          results.push({ place, error: errText(e), products: [] });
        }
      }
    } finally {
      await context.close();
    }
    return report(`${brand}${useProxy ? " (via proxy)" : ""}`, results);
  }

  async function pnp() {
    const { context, call } = await openStore("pick-n-pay");
    const base = "/pnphybris/v2/pnp-spa";
    const headers = { "x-anonymous-consents": "%5B%5D", "x-pnp-cache-key": "anonymous" };
    const results = [];
    const extra = [];
    try {
      for (const place of places) {
        try {
          const cart = await call("POST", `${base}/users/anonymous/carts?fields=DEFAULT&lang=en&curr=ZAR`, {}, headers);
          if (!extra.length && cart?.baseStore) extra.push(`no address yet: ${cart.baseStore.displayName ?? cart.baseStore.uid} (${cart.baseStore.uid})`);
          await call("POST", `${base}/users/anonymous/carts/${cart.guid}/addresses/delivery?lang=en&curr=ZAR`, pnpDeliveryAddress(place), headers);
          const assigned = await call("GET", `${base}/users/anonymous/carts/${cart.guid}?fields=DEFAULT&lang=en&curr=ZAR`, undefined, headers);
          const uid = assigned?.baseStore?.uid;
          if (!uid) throw new Error("no store assigned to the cart");
          const products = [];
          for (const q of QUERIES) {
            const json = await call(
              "POST",
              `${base}/products/search?fields=products(code,name,price(FULL),stock(FULL),available)&query=${encodeURIComponent(q)}&pageSize=40&storeCode=${uid}&lang=en&curr=ZAR`,
              {},
              headers
            );
            products.push(...parsePnpProducts(json));
          }
          results.push({ place, branch: `${assigned.baseStore.displayName ?? uid} (${uid})`, products });
        } catch (e) {
          results.push({ place, error: errText(e), products: [] });
        }
      }
    } finally {
      await context.close();
    }
    return report("Pick n Pay", results, extra);
  }

  const RUNS = {
    checkers: () => shopriteGroup("checkers", "Checkers"),
    shoprite: () => shopriteGroup("shoprite", "Shoprite"),
    "pick-n-pay": pnp,
  };
  try {
    for (const store of STORES) {
      if (!RUNS[store]) {
        console.log(`== ${store} == not covered by this probe\n`);
        continue;
      }
      console.log(await RUNS[store]());
    }
  } finally {
    await browser.close();
  }
}

// The offline test imports this file for the pure parts above, and runs it as
// a script for the whole thing; only a run as a script goes live.
if (process.env.PROBE_LIBRARY_ONLY !== "1") await main();
