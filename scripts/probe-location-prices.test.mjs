// Offline test for scripts/probe-location-prices.mjs. No network, no stores.
//
//   node scripts/probe-location-prices.test.mjs
//
// Serves three local stand-ins - Checkers, Shoprite, Pick n Pay - that answer
// the requests the probe makes, and price each product by the branch the
// request names. So a probe that dropped the branch on the way to the search
// (the bug that would make every place look the same) reports no difference
// and fails here.
//
// The shapes are trimmed from browser recordings of the real sites (#66), but
// the products, prices and branches are made up. The stand-ins prove the
// probe follows the address -> branch -> search chain; they do not prove the
// real sites still answer that way. Only the live run does that.

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "probe-location-prices.mjs");
const CHROMIUM = process.env.PROBE_CHROMIUM || "/opt/pw-browsers/chromium";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ok   ${n}`); };
const bad = (n, why) => { fail++; console.log(`  FAIL ${n}\n     ${why}`); };
const has = (out, needle, name) =>
  out.includes(needle) ? ok(name) : bad(name, `expected "${needle}"`);
const hasnt = (out, needle, name) =>
  out.includes(needle) ? bad(name, `found "${needle}"`) : ok(name);
const eq = (a, b, name) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(name) : bad(name, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// Which place a coordinate is. The probe only ever sends the PLACES table's
// own coordinates, so the latitude alone tells them apart.
// ALX is no place of the probe's: it is a nearby store's own coordinates,
// which the probe asks from when a place itself gets no delivering store.
const ALX = { latitude: -26.103, longitude: 28.097 };
const placeOf = (lat) =>
  ({ "-26.1076": "JHB", "-33.9175": "CPT", "-29.7258": "DBN", "-33.9608": "GQB", [String(ALX.latitude)]: "ALX" })[String(lat)] ?? "??";

function readRaw(req) {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (d) => (s += d));
    req.on("end", () => resolve(s));
  });
}
const readBody = async (req) => {
  const s = await readRaw(req);
  return s ? JSON.parse(s) : null;
};

// busy: the page polls forever, as pnp.co.za's does. A probe that waits for
// the network to go quiet waits out its whole timeout, as the first live run
// did (2026-10-03).
function base(handler, { busy = false, pretty = false } = {}) {
  return http.createServer(async (req, res) => {
    // pretty: Pick n Pay indents every response, errors included.
    const json = (o, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(pretty ? JSON.stringify(o, null, 2) : JSON.stringify(o));
    };
    const body = req.method === "POST" ? await readBody(req) : null;
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<html><body>shop${busy ? "<script>setInterval(() => fetch('/ping'), 250)</script>" : ""}</body></html>`);
    }
    if (!(await handler(req, body, json))) json({ error: "not found" }, 404);
  });
}

// Checkers / Shoprite. Each place gets its own storeId; the catalogue prices
// by the storeId in the search body, never by anything else.
// Sandton and Durban are one price zone, Sea Point another, as the hand check
// found: bread and Oros differ, and each stocks a different egg brand.
const SHOPRITE_GROUP_CATALOGUE = {
  JHB: [
    { id: "B1", name: "Bakery White Bread 700g", price: "16.99", oldPrice: null, bonusBuy: null, q: "bread" },
    { id: "O1", name: "Oros Orange Squash 2L", price: "36.99", oldPrice: "4599", bonusBuy: null, q: "oros" },
    { id: "E1", name: "Eggbert Large Eggs 18", price: "54.99", oldPrice: null, bonusBuy: null, q: "eggs" },
    { id: "M1", name: "Full Cream Milk 2L", price: "32.99", oldPrice: null, bonusBuy: null, q: "milk" },
  ],
  CPT: [
    { id: "B1", name: "Bakery White Bread 700g", price: "17.99", oldPrice: null, bonusBuy: null, q: "bread" },
    { id: "O1", name: "Oros Orange Squash 2L", price: "45.99", oldPrice: null, bonusBuy: null, q: "oros" },
    { id: "E2", name: "Nulaid Large Eggs 18", price: "57.99", oldPrice: null, bonusBuy: null, q: "eggs" },
    { id: "M1", name: "Full Cream Milk 2L", price: "32.99", oldPrice: null, bonusBuy: null, q: "milk" },
  ],
};
SHOPRITE_GROUP_CATALOGUE.DBN = SHOPRITE_GROUP_CATALOGUE.JHB;

// The stand-in reads the branch from the storeContexts cookie only, ignoring
// the body: the live site behaved this way on the third run, where a branch
// sent in the body alone got the default store. Per place:
//   notServed   - no store at all; the site says another brand serves it.
//   defaultAt   - priced at the default store whatever is asked, so the
//                 probe must say "NOT from" rather than read it as a zone.
//   digitalAt   - only a "digital" store, which sells nothing, as Shoprite
//                 answered for Sandton and Sea Point on the fourth run.
//   deliversVia - for a digitalAt place, the nearby store whose own
//                 coordinates do get a delivering store.
SHOPRITE_GROUP_CATALOGUE.DEF = SHOPRITE_GROUP_CATALOGUE.JHB;
SHOPRITE_GROUP_CATALOGUE.ALX = SHOPRITE_GROUP_CATALOGUE.JHB;
//   mixedAt     - a delivering store plus a digital one, and a catalogue
//                 that comes back empty while the digital one is in the
//                 cookie. Invented, to exercise the retry: the live Soweto
//                 recording had a digital store alongside and sold fine.
function shopriteGroupServer({ brand, notServed = [], defaultAt = [], digitalAt = [], deliversVia = {}, mixedAt = [] }) {
  return base(async (req, body, json) => {
    if (req.url.startsWith("/api/store/fetch-store-contexts")) {
      const place = placeOf(body?.address?.coordinates?.latitude);
      if (notServed.includes(place))
        return json({ storeContexts: [], servicedByOtherBrand: true, otherBrandStoreContexts: [] }), true;
      if (digitalAt.includes(place))
        return json({ storeContexts: [{ storeId: `5f32a7-${place}x01`, serviceOptionIds: ["digital"] }] }), true;
      if (mixedAt.includes(place))
        return json({
          storeContexts: [
            { storeId: `5f32a7-${place}x01`, serviceOptionIds: ["d1f0"], hasCapacity: ["d1f0"], brandPriority: 4 },
            { storeId: "5f32a7-DIGx09", serviceOptionIds: ["digital"], hasCapacity: ["digital"], brandPriority: 0 },
          ],
        }), true;
      return json({
        storeContexts: [
          { storeId: `5f32a7-${place}x01`, serviceOptionIds: ["d1f0"] },
          { storeId: `5f32a7-${place}x02`, serviceOptionIds: ["d1f1"] },
        ],
        servicedByOtherBrand: false,
      }), true;
    }
    if (req.url.startsWith("/api/browse-by-store/get-stores-by-location")) {
      const { latitude, longitude, limit } = body?.payload ?? {};
      const place = placeOf(latitude);
      // Nearest first; the nearest is at the place itself.
      const stores = [{ name: `${brand} ${place} Mall`, posSiteCode: "1234", distanceKm: 2.4, coordinates: { latitude, longitude } }];
      // "far": three more stores that don't deliver come first, so only a
      // widened search reaches the one that does.
      if (deliversVia[place] === "far")
        for (const km of [3.1, 5.6, 8.2]) stores.push({ name: `${brand} ${km}km`, distanceKm: km, coordinates: { latitude, longitude } });
      if (deliversVia[place] === "ALX" || deliversVia[place] === "far")
        stores.push({ name: `${brand} Alexandra`, posSiteCode: "5678", distanceKm: 2.9, coordinates: ALX });
      return json(stores.slice(0, limit)), true;
    }
    if (req.url.startsWith("/api/catalogue/get-products-filter")) {
      const cookie = (req.headers.cookie ?? "").match(/(?:^|;\s*)storeContexts=([^;]*)/);
      const named = cookie ? JSON.parse(decodeURIComponent(cookie[1])) : [];
      const fromCookie = named?.[0]?.storeId;
      if (mixedAt.includes(fromCookie?.match(/-(\w{3})x0\d$/)?.[1]) && named.some((c) => c.storeId === "5f32a7-DIGx09"))
        return json({ products: [], totalCount: 0 }), true;
      const asked = fromCookie?.match(/-(\w{3})x0\d$/)?.[1];
      const storeId = fromCookie && !defaultAt.includes(asked) ? fromCookie : "5f32a7-DEFx01";
      const place = storeId.match(/-(\w{3})x0\d$/)?.[1];
      const q = body?.filterData?.filter?.productListSource?.search;
      // A digital store's catalogue is empty.
      const products = (digitalAt.includes(place) ? [] : (SHOPRITE_GROUP_CATALOGUE[place] ?? []))
        .filter((p) => p.q === q)
        .map((p) => ({ id: p.id, name: p.name, price: p.price, oldPrice: p.oldPrice, bonusBuy: p.bonusBuy, storeId }));
      // The real site lists results under data in some responses.
      return json(place === "DBN" ? { data: { products } } : { products, totalCount: products.length }), true;
    }
    return false;
  });
}

// Pick n Pay. A cart starts at the default store, an address moves it to the
// nearest one, and the search prices by the storeCode in the URL.
const PNP_STORES = { JHB: "GC14", CPT: "WC09", DBN: "KC03" };
const PNP_PRICE = {
  GC14: { E6: 17.99, A1: 18.99 },
  WC09: { E6: 22.99, A1: 17.99 },
  KC03: { E6: 19.99, A1: 18.99 },
  WC21: { E6: 99.99, A1: 99.99 },
};

function pnpServer({ failSearchAt } = {}) {
  const carts = new Map();
  let n = 0;
  const P = "/pnphybris/v2/pnp-spa";
  return base(async (req, body, json) => {
    if (!req.url.startsWith(P)) return false;
    // The real API refuses an anonymous call without these.
    if (req.headers["x-pnp-cache-key"] !== "anonymous") return json({ errors: [{ type: "CacheKey" }] }, 400), true;
    const url = new URL(req.url, "http://x");
    const cartMatch = url.pathname.match(/\/users\/anonymous\/carts\/([^/]+)(\/addresses\/delivery)?$/);
    if (req.method === "POST" && url.pathname === `${P}/users/anonymous/carts`) {
      const guid = `cart-${++n}`;
      carts.set(guid, "WC21");
      return json({ guid, code: "0001", baseStore: { uid: "WC21", displayName: "PnP Constantia" } }), true;
    }
    if (cartMatch && cartMatch[2] && req.method === "POST") {
      // What the first live run hit: an address with an empty street is
      // refused, whatever its coordinates.
      if (!body?.streetname || !body?.streetnumber)
        return json({ errors: [{ message: "This field is required.", subject: "streetname", type: "ValidationError" }] }, 400), true;
      carts.set(cartMatch[1], PNP_STORES[placeOf(body?.latitude)] ?? "WC21");
      return json(null), true;
    }
    if (cartMatch && req.method === "GET") {
      const uid = carts.get(cartMatch[1]);
      return json({ guid: cartMatch[1], baseStore: { uid, displayName: `PnP ${uid}` } }), true;
    }
    if (url.pathname === `${P}/products/search`) {
      const store = url.searchParams.get("storeCode");
      if (store === failSearchAt) return json({ errors: [{ type: "ServerError" }] }, 503), true;
      const prices = PNP_PRICE[store] ?? {};
      const all = [
        { code: "E6", name: "PnP Large Eggs 6", q: "eggs" },
        { code: "A1", name: "Albany Superior White Bread 700g", q: "bread" },
      ];
      const products = all
        .filter((p) => p.q === url.searchParams.get("query") && prices[p.code])
        .map((p) => ({ code: p.code, name: p.name, price: { value: prices[p.code], currencyIso: "ZAR" } }));
      return json({ products, pagination: { totalResults: products.length } }), true;
    }
    return false;
  }, { busy: true, pretty: true });
}

// Stands in for api.scraperapi.com: takes ?api_key=&url=&keep_headers=true,
// forwards the request to url, and remembers what it was asked.
function scraperApiServer(seen) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const target = u.searchParams.get("url");
    seen.push({ key: u.searchParams.get("api_key"), keep: u.searchParams.get("keep_headers"), target });
    const body = req.method === "POST" ? await readRaw(req) : undefined;
    // keep_headers=true: the caller's own headers go through, the cookie included.
    const r = await fetch(target, {
      method: req.method,
      headers: { "content-type": "application/json", ...(req.headers.cookie && { cookie: req.headers.cookie }) },
      body,
    });
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(await r.text());
  });
}

async function listen(srv) {
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${srv.address().port}`;
}

async function runProbe(env) {
  const child = spawn(process.execPath, [PROBE], {
    env: {
      ...process.env,
      PROBE_CHROMIUM: CHROMIUM,
      PROBE_LIBRARY_ONLY: "",
      PROXY_STORES: "",
      SCRAPERAPI_KEY: "",
      PLACES: "JHB,CPT,DBN",
      ...env,
    },
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const code = await new Promise((r) => child.on("close", r));
  return { out, code };
}

// ---------------------------------------------------------------------------
console.log("the pure parts");
process.env.PROBE_LIBRARY_ONLY = "1";
const lib = await import(PROBE);

eq(lib.PLACES.length, 9, "one place per province");
eq(new Set(lib.PLACES.map((p) => p.province)).size, 9, "nine different provinces");

eq(
  lib.parseShopriteGroupProducts({ products: [
    { id: "a", name: "A", price: "25.99", oldPrice: "2999" },
    { id: "b", name: "B", price: "25.99", oldPrice: "2599" },
    { id: "c", name: "C", price: "10.00", bonusBuy: { id: "bb" } },
    { id: "d", name: "D", price: "0" },
  ] }),
  [
    { id: "a", name: "A", price: 25.99, promo: true },
    { id: "b", name: "B", price: 25.99, promo: false },
    { id: "c", name: "C", price: 10, promo: true },
  ],
  "Checkers: oldPrice is cents, price is rands; a zero price is dropped"
);
eq(
  lib.parsePnpProducts({ products: [
    { code: "1", name: "X", price: { value: 17.99, oldPrice: 19.99 } },
    { code: "2", name: "Y", price: { value: 17.99 } },
    { code: "3", name: "Z" },
  ] }),
  [
    { id: "1", name: "X", price: 17.99, promo: true },
    { id: "2", name: "Y", price: 17.99, promo: false },
  ],
  "Pick n Pay: promo from oldPrice; no price is dropped"
);

const [J, C, D] = lib.PLACES;
const c = lib.compare([
  { place: J, products: [{ id: "1", name: "one", price: 10 }, { id: "1", name: "one", price: 99 }, { id: "2", name: "two", price: 5 }, { id: "3", name: "three", price: 1 }] },
  { place: C, products: [{ id: "1", name: "one", price: 12 }, { id: "2", name: "two", price: 5 }] },
  { place: D, error: "HTTP 503", products: [] },
]);
eq(c.places, 2, "a place that errored is not compared");
eq([c.shared, c.same, c.differ.length, c.onlySome], [2, 1, 1, 1], "counts same, differ and only-some");
eq(c.differ[0].spread, 2, "a repeated product keeps its first price at a place");
eq(
  lib.errText(new Error('page.evaluate: Error: HTTP 400 {\n  "errors" : [ {\n    "type" : "ValidationError"\n  } ]\n}')),
  'HTTP 400 { "errors" : [ { "type" : "ValidationError" } ] }',
  "an indented error body is kept, on one line"
);
eq(lib.PLACES.every((p) => p.street), true, "every place has a street for Pick n Pay");
eq(lib.EXTRA_PLACES.every((p) => p.street && !lib.PLACES.some((q) => q.code === p.code)), true, "second towns are extra, with streets");

// ---------------------------------------------------------------------------
console.log("\nthe live chain, against stand-ins");
const KEY = "test-key-5f3e9a";
const seen = [];
const servers = {
  checkers: shopriteGroupServer({ brand: "Checkers" }),
  shoprite: shopriteGroupServer({
    brand: "Shoprite",
    notServed: ["CPT"],
    defaultAt: ["DBN"],
    digitalAt: ["JHB", "GQB"],
    deliversVia: { JHB: "ALX" },
  }),
  pnp: pnpServer({ failSearchAt: "KC03" }),
  scraperApi: scraperApiServer(seen),
};
let run;
try {
  const checkersOrigin = await listen(servers.checkers);
  run = await runProbe({
    CHECKERS_ORIGIN: checkersOrigin,
    SHOPRITE_ORIGIN: await listen(servers.shoprite),
    PNP_ORIGIN: await listen(servers.pnp),
    SCRAPERAPI_URL: `${await listen(servers.scraperApi)}/`,
    SCRAPERAPI_KEY: KEY,
    // Checkers through the stand-in ScraperAPI, Shoprite direct: both paths.
    PROXY_STORES: "checkers",
    QUERIES: "eggs bread oros milk",
  });
  seen.checkersOrigin = checkersOrigin;
} finally {
  await Promise.all(Object.values(servers).map((s) => new Promise((r) => s.close(r))));
}
const { out } = run;
const section = (name) => {
  const start = out.indexOf(`== ${name}`);
  if (start < 0) return "";
  const end = out.indexOf("\n== ", start + 1);
  return out.slice(start, end < 0 ? undefined : end);
};
const checkers = section("Checkers");
const shoprite = section("Shoprite");
const pnp = section("Pick n Pay");

eq(run.code, 0, "exits cleanly");
has(out, "places:  JHB CPT DBN", "PLACES narrows the run");

console.log(" Checkers");
has(checkers, "JHB Sandton", "lists Sandton");
has(checkers, "Checkers JHB Mall (2.4km)", "names the nearest branch");
has(checkers, "DBN uMhlanga       4 items  Checkers DBN Mall", "reads results under data too");
has(checkers, "price differs:         2", "finds the two prices that differ");
has(checkers, "same price everywhere: 2", "and the ones that don't");
has(checkers, "stocked at only some places: 2", "notices each place stocks different eggs");
has(checkers, "Oros Orange Squash 2L  (R36.99-R45.99)", "biggest spread first");
has(checkers, "JHB 36.99*", "marks Sandton's Oros as a promotion");
has(checkers, "* on promotion there", "explains the mark");

console.log(" Shoprite");
has(shoprite, "CPT Sea Point      0 items  not served (other brand)", "says where it doesn't deliver");
has(shoprite, "Shoprite DBN Mall", "carries on with the next place");
has(shoprite, "priced at DEFx01, NOT from its 2 nearby", "says when the site priced at its default store");
has(shoprite, "JHB Sandton        4 items  Shoprite JHB Mall (2.4km); delivers from Shoprite Alexandra (2.9km)",
  "a place with only a digital store is priced at the nearest store that delivers");
has(shoprite, "priced at ALXx01, from its 2 nearby", "and it is that store's prices");
has(checkers, "priced at JHBx01, from its 2 nearby", "says which nearby store Sandton was priced at");

console.log(" Pick n Pay");
has(pnp, "no address yet: PnP Constantia (WC21)", "reports the default store");
has(pnp, "PnP GC14 (GC14)", "moves Sandton's cart to its own store");
has(pnp, "PnP WC09 (WC09)", "and Sea Point's to another");
hasnt(pnp, "99.99", "never prices from the default store");
has(pnp, "DBN uMhlanga     ERROR search: HTTP 503", "one failing place is reported, with the step, not fatal");
has(pnp, '"type": "ServerError"', "and the reason, not just the first line of it");
hasnt(out, "warmup:", "does not wait for a page that never goes quiet");
has(pnp, "PnP Large Eggs 6  (R17.99-R22.99)", "finds the egg difference");
has(pnp, "Albany Superior White Bread 700g  (R17.99-R18.99)", "and the bread one");

console.log(" ScraperAPI");
has(checkers, "== Checkers (via ScraperAPI) ==", "says Checkers went through it");
has(shoprite, "== Shoprite ==", "and Shoprite didn't");
eq(seen.length > 0 && seen.every((r) => r.key === KEY && r.keep === "true"), true, "sends the key, keeping the site's headers");
eq(seen.every((r) => r.target.startsWith(`${seen.checkersOrigin}/api/`)), true, "asks for the store's own API URLs, Checkers only");
eq(seen.filter((r) => r.target.includes("get-products-filter")).length, 12, "four searches at each of three places");
hasnt(out, KEY, "never prints the key");

console.log("\nnowhere nearby delivers");
const lonely = shopriteGroupServer({ brand: "Shoprite", digitalAt: ["GQB"], mixedAt: ["DBN"] });
let second;
try {
  second = await runProbe({ SHOPRITE_ORIGIN: await listen(lonely), STORES: "shoprite", PLACES: "GQB,DBN", QUERIES: "bread" });
} finally {
  await new Promise((r) => lonely.close(r));
}
has(second.out, "none of the 1 nearest delivers", "says so, counting the stores it actually tried");
has(second.out, "GQB Gqeberha       0 items", "an empty search is not an error");
has(second.out, "EMPTY; stores GQBx01[digital cap:? p:?]; reply keys products,totalCount, totalCount 0", "and says what the site named and answered");
hasnt(second.out.slice(second.out.indexOf("GQB Gqeberha")).split("\n")[0], "without digital", "no retry when nothing named delivers");
has(second.out, "DBN uMhlanga       0 items", "a delivering store that sells nothing with the digital one alongside");
has(second.out, "DBNx01[d1f0 cap:d1f0 p:4] DIGx09[digital cap:digital p:0]", "prints each store's capacity and priority");
has(second.out, "without digital: 1 items", "and the retry without the digital store finds bread");

console.log("\nthe nearest that delivers is further out");
const far = shopriteGroupServer({ brand: "Shoprite", digitalAt: ["GQB"], deliversVia: { GQB: "far" } });
let narrow, wide;
try {
  const origin = await listen(far);
  const env = { SHOPRITE_ORIGIN: origin, STORES: "shoprite", PLACES: "GQB", QUERIES: "bread" };
  narrow = await runProbe(env);
  wide = await runProbe({ ...env, NEAREST_TRIES: "5" });
} finally {
  await new Promise((r) => far.close(r));
}
has(narrow.out, "none of the 3 nearest delivers", "three tries stop short");
has(wide.out, "delivers from Shoprite Alexandra", "NEAREST_TRIES widens the search to reach it");

if (fail) console.log(`\n--- probe output ---\n${out}\n--- second ---\n${second?.out ?? ""}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
